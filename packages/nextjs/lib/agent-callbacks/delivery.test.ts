import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { __setUrlSafetyDnsResolversForTests } from "~~/utils/urlSafety";

process.env.DATABASE_URL = "memory:";

type DbModule = typeof import("../db");
type DbTestMemoryModule = typeof import("../db/testMemory");
type RegistryModule = typeof import("./registry");
type EventsModule = typeof import("./events");
type DeliveryModule = typeof import("./delivery");
type AgentCallbackEventType = import("./types").AgentCallbackEventType;

let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let registry: RegistryModule;
let events: EventsModule;
let delivery: DeliveryModule;

before(async () => {
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  registry = await import("./registry");
  events = await import("./events");
  delivery = await import("./delivery");
});

beforeEach(async () => {
  __setUrlSafetyDnsResolversForTests({
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => [],
  });
  await dbModule.dbClient.execute("DELETE FROM agent_callback_events");
  await dbModule.dbClient.execute("DELETE FROM agent_callback_subscriptions");
});

after(() => {
  __setUrlSafetyDnsResolversForTests(null);
  dbModule.__setDatabaseResourcesForTests(null);
});

async function registerSubscription(id = "sub-a", eventTypes: AgentCallbackEventType[] = ["question.submitted"]) {
  await registry.upsertAgentCallbackSubscription({
    agentId: "agent-a",
    callbackUrl: `https://agent.example/${id}`,
    eventTypes,
    id,
    secret: `secret-${id}`,
  });
}

test("enqueueAgentCallbackEvent journals one event per matching active subscription", async () => {
  await registerSubscription("sub-a", ["question.submitted"]);
  await registerSubscription("sub-b", ["question.failed"]);

  const rows = await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    payload: { contentId: "42" },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.eventKey, "sub-a:event-a");
  assert.equal(
    rows[0]?.payload,
    '{"agentId":"agent-a","eventId":"event-a","eventType":"question.submitted","payload":{"contentId":"42"}}',
  );

  const duplicate = await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    payload: { contentId: "42" },
  });
  assert.equal(duplicate.length, 1);

  const count = await dbModule.dbClient.execute("SELECT COUNT(*) AS count FROM agent_callback_events");
  assert.equal(Number(count.rows[0]?.count), 1);
});

test("leaseDueAgentCallbackEvents leases pending rows and complete marks delivery", async () => {
  await registerSubscription();
  await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    now: new Date("2026-04-23T12:00:00.000Z"),
    payload: { contentId: "42" },
  });

  const leased = await delivery.leaseDueAgentCallbackEvents({
    leaseMs: 30_000,
    now: new Date("2026-04-23T12:00:01.000Z"),
    workerId: "worker-a",
  });

  assert.equal(leased.length, 1);
  assert.equal(leased[0]?.status, "delivering");
  assert.equal(leased[0]?.attemptCount, 1);

  const completed = await delivery.completeAgentCallbackDelivery({
    eventKey: "sub-a:event-a",
    now: new Date("2026-04-23T12:00:02.000Z"),
    workerId: "worker-a",
  });

  assert.equal(completed?.status, "delivered");
  assert.equal(completed?.leaseOwner, null);
});

test("failAgentCallbackDelivery schedules retries and dead letters after max attempts", async () => {
  await registerSubscription();
  await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    now: new Date("2026-04-23T12:00:00.000Z"),
    payload: { contentId: "42" },
  });

  await delivery.leaseDueAgentCallbackEvents({
    now: new Date("2026-04-23T12:00:01.000Z"),
    workerId: "worker-a",
  });
  const retry = await delivery.failAgentCallbackDelivery({
    baseDelayMs: 1_000,
    error: "503",
    eventKey: "sub-a:event-a",
    maxAttempts: 2,
    now: new Date("2026-04-23T12:00:02.000Z"),
    workerId: "worker-a",
  });

  assert.equal(retry?.status, "retrying");
  assert.equal(retry?.nextAttemptAt.toISOString(), "2026-04-23T12:00:03.000Z");

  await delivery.leaseDueAgentCallbackEvents({
    now: new Date("2026-04-23T12:00:03.000Z"),
    workerId: "worker-a",
  });
  const dead = await delivery.failAgentCallbackDelivery({
    error: "still failing",
    eventKey: "sub-a:event-a",
    maxAttempts: 2,
    now: new Date("2026-04-23T12:00:04.000Z"),
    workerId: "worker-a",
  });

  assert.equal(dead?.status, "dead");
  assert.equal(dead?.lastError, "still failing");
});

test("buildCallbackDeliveryRequest signs leased event payload", async () => {
  await registerSubscription();
  const [event] = await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    payload: { contentId: "42" },
  });
  assert.ok(event);

  const request = delivery.buildCallbackDeliveryRequest({
    event,
    now: new Date("2026-04-23T12:00:00.000Z"),
  });

  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://agent.example/sub-a");
  assert.match(request.headers["x-curyo-callback-signature"], /^v1=[a-f0-9]{64}$/);
});

test("deliverLeasedAgentCallbackEvent disables redirects and sets a timeout", async () => {
  await registerSubscription();
  const [event] = await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    payload: { contentId: "42" },
  });
  assert.ok(event);

  const result = await delivery.deliverLeasedAgentCallbackEvent({
    event,
    fetchImpl: async (_url, init) => {
      assert.equal(init?.redirect, "manual");
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(null, { status: 204, statusText: "No Content" });
    },
    now: new Date("2026-04-23T12:00:00.000Z"),
  });

  assert.deepEqual(result, {
    ok: true,
    status: 204,
    statusText: "No Content",
  });
});

test("deliverLeasedAgentCallbackEvent rejects unsafe stored URLs without fetching", async () => {
  await registerSubscription();
  const [event] = await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    payload: { contentId: "42" },
  });
  assert.ok(event);

  let fetched = false;
  await assert.rejects(
    () =>
      delivery.deliverLeasedAgentCallbackEvent({
        event: { ...event, callbackUrl: "http://127.0.0.1:3000/callback" },
        fetchImpl: async () => {
          fetched = true;
          return new Response(null, { status: 204 });
        },
      }),
    /Callback URL must be a public HTTPS URL/,
  );
  assert.equal(fetched, false);
});

test("processDueAgentCallbackDeliveries delivers successes and schedules retries", async () => {
  await registerSubscription("sub-a", ["question.submitted"]);
  await registerSubscription("sub-b", ["question.submitted"]);
  await events.enqueueAgentCallbackEvent({
    agentId: "agent-a",
    eventId: "event-a",
    eventType: "question.submitted",
    now: new Date("2026-04-23T12:00:00.000Z"),
    payload: { contentId: "42" },
  });

  const result = await delivery.processDueAgentCallbackDeliveries({
    fetchImpl: async (url, init) => {
      assert.equal(init?.redirect, "manual");
      assert.ok(init?.signal instanceof AbortSignal);
      return new Response(null, {
        status: String(url).endsWith("/sub-a") ? 204 : 503,
        statusText: String(url).endsWith("/sub-a") ? "No Content" : "Service Unavailable",
      });
    },
    now: new Date("2026-04-23T12:00:01.000Z"),
    workerId: "worker-a",
  });

  assert.deepEqual(result, {
    dead: 0,
    delivered: 1,
    leased: 2,
    released: 0,
    retrying: 1,
  });

  assert.equal((await events.getAgentCallbackEvent("sub-a:event-a"))?.status, "delivered");
  assert.equal((await events.getAgentCallbackEvent("sub-b:event-a"))?.status, "retrying");
});
