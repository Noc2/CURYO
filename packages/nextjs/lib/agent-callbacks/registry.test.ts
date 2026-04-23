import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

process.env.DATABASE_URL = "memory:";

type DbModule = typeof import("../db");
type DbTestMemoryModule = typeof import("../db/testMemory");
type RegistryModule = typeof import("./registry");

let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let registry: RegistryModule;

before(async () => {
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  registry = await import("./registry");
});

beforeEach(async () => {
  await dbModule.dbClient.execute("DELETE FROM agent_callback_events");
  await dbModule.dbClient.execute("DELETE FROM agent_callback_subscriptions");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
});

test("upsertAgentCallbackSubscription registers and updates a callback", async () => {
  const now = new Date("2026-04-23T12:00:00.000Z");
  const first = await registry.upsertAgentCallbackSubscription({
    agentId: "agent-a",
    callbackUrl: "https://agent.example/callback",
    eventTypes: ["question.submitted", "question.failed"],
    id: "sub-a",
    now,
    secret: "secret-a",
  });

  assert.equal(first?.id, "sub-a");
  assert.deepEqual(first?.eventTypes, ["question.failed", "question.submitted"]);

  const second = await registry.upsertAgentCallbackSubscription({
    agentId: "agent-a",
    callbackUrl: "https://agent.example/callback",
    eventTypes: ["question.settled"],
    now: new Date("2026-04-23T12:05:00.000Z"),
    secret: "secret-b",
  });

  assert.equal(second?.id, "sub-a");
  assert.equal(second?.secret, "secret-b");
  assert.deepEqual(second?.eventTypes, ["question.settled"]);
});

test("disableAgentCallbackSubscription removes it from active listings", async () => {
  await registry.upsertAgentCallbackSubscription({
    agentId: "agent-a",
    callbackUrl: "https://agent.example/callback",
    eventTypes: ["question.submitted"],
    id: "sub-a",
    secret: "secret-a",
  });

  await registry.disableAgentCallbackSubscription({ id: "sub-a" });

  assert.deepEqual(await registry.listActiveAgentCallbackSubscriptions("agent-a"), []);
});
