import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalAgents = env.CURYO_MCP_AGENTS;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;

env.DATABASE_URL = "memory:";

type AgentAsksByClientRouteModule = typeof import("./asks/by-client-request/route");
type AgentAsksByClientAuditRouteModule = typeof import("./asks/by-client-request/audit/route");
type AgentAsksAuditRouteModule = typeof import("./asks/[operationKey]/audit/route");
type AgentAsksExportRouteModule = typeof import("./asks/export/route");
type AgentAsksOperationRouteModule = typeof import("./asks/[operationKey]/route");
type AgentAsksRouteModule = typeof import("./asks/route");
type AgentQuoteRouteModule = typeof import("./quote/route");
type AgentResultsByClientRouteModule = typeof import("./results/by-client-request/route");
type AgentResultsOperationRouteModule = typeof import("./results/[operationKey]/route");
type AgentTemplatesRouteModule = typeof import("./templates/route");
type CallbackDeliveryModule = typeof import("~~/lib/agent-callbacks/delivery");
type CallbackEventsModule = typeof import("~~/lib/agent-callbacks/events");
type CallbackLifecycleModule = typeof import("~~/lib/agent-callbacks/lifecycle");
type CallbackRegistryModule = typeof import("~~/lib/agent-callbacks/registry");
type DbModule = typeof import("../../../lib/db");
type DbTestMemoryModule = typeof import("../../../lib/db/testMemory");
type McpBudgetModule = typeof import("~~/lib/mcp/budget");
type McpToolsModule = typeof import("~~/lib/mcp/tools");
type UrlSafetyModule = typeof import("~~/utils/urlSafety");

const OPERATION_KEY = `0x${"1".repeat(64)}` as const;

let asksByClientRoute: AgentAsksByClientRouteModule;
let asksByClientAuditRoute: AgentAsksByClientAuditRouteModule;
let asksAuditRoute: AgentAsksAuditRouteModule;
let asksExportRoute: AgentAsksExportRouteModule;
let asksOperationRoute: AgentAsksOperationRouteModule;
let asksRoute: AgentAsksRouteModule;
let callbackDeliveryModule: CallbackDeliveryModule;
let callbackEventsModule: CallbackEventsModule;
let callbackLifecycleModule: CallbackLifecycleModule;
let callbackRegistryModule: CallbackRegistryModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let mcpBudgetModule: McpBudgetModule;
let mcpToolsModule: McpToolsModule;
let quoteRoute: AgentQuoteRouteModule;
let resultsByClientRoute: AgentResultsByClientRouteModule;
let resultsOperationRoute: AgentResultsOperationRouteModule;
let templatesRoute: AgentTemplatesRouteModule;
let urlSafetyModule: UrlSafetyModule;

function restoreEnv(name: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

function configureAgent() {
  env.CURYO_MCP_AGENTS = JSON.stringify([
    {
      dailyBudgetAtomic: "5000000",
      id: "route-agent",
      perAskLimitAtomic: "1000000",
      scopes: ["curyo:ask", "curyo:balance", "curyo:quote", "curyo:read"],
      token: "secret-token",
    },
  ]);
}

function makePost(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    body: JSON.stringify(body),
    headers: new Headers({
      authorization: "Bearer secret-token",
      "content-type": "application/json",
      ...headers,
    }),
    method: "POST",
  });
}

function makeGet(url: string, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    headers: new Headers({
      authorization: "Bearer secret-token",
      ...headers,
    }),
    method: "GET",
  });
}

function questionPayload(clientRequestId: string) {
  return {
    bounty: {
      amount: "1000000",
      asset: "USDC",
      rewardPoolExpiresAt: "1762000000",
    },
    chainId: 42220,
    clientRequestId,
    question: {
      categoryId: "5",
      contextUrl: "https://example.com/context",
      description: "Would this make you want to learn more?",
      tags: ["agents", "pitch"],
      title: "Pitch interest",
    },
  };
}

async function seedManagedAskAudit(params: {
  chainId?: number;
  clientRequestId: string;
  contentId?: string | null;
  operationKey?: `0x${string}`;
}) {
  const operationKey = params.operationKey ?? OPERATION_KEY;
  const chainId = params.chainId ?? 42220;
  const now = new Date("2026-04-23T12:00:00.000Z");
  const contentId = params.contentId ?? null;

  await dbModule.dbClient.execute({
    args: [
      operationKey,
      "route-agent",
      params.clientRequestId,
      "payload-hash",
      chainId,
      "5",
      "1000000",
      "submitted",
      contentId,
      null,
      now,
      now,
    ],
    sql: `
      INSERT INTO mcp_agent_budget_reservations (
        operation_key,
        agent_id,
        client_request_id,
        payload_hash,
        chain_id,
        category_id,
        payment_amount,
        status,
        content_id,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });

  await dbModule.dbClient.execute({
    args: [
      operationKey,
      params.clientRequestId,
      "payload-hash",
      chainId,
      "0x0000000000000000000000000000000000000001",
      "1000000",
      "1000000",
      "0",
      1,
      "submitted",
      contentId,
      now,
      now,
    ],
    sql: `
      INSERT INTO x402_question_submissions (
        operation_key,
        client_request_id,
        payload_hash,
        chain_id,
        payment_asset,
        payment_amount,
        bounty_amount,
        service_fee_amount,
        question_count,
        status,
        content_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });

  await dbModule.dbClient.execute({
    args: [
      operationKey,
      "route-agent",
      params.clientRequestId,
      "payload-hash",
      chainId,
      "5",
      "1000000",
      "reserved",
      now,
    ],
    sql: `
      INSERT INTO mcp_agent_ask_audit_records (
        operation_key,
        agent_id,
        client_request_id,
        payload_hash,
        chain_id,
        category_id,
        payment_amount,
        event_type,
        status,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'reserved', ?, ?)
    `,
  });

  await dbModule.dbClient.execute({
    args: [
      operationKey,
      "route-agent",
      params.clientRequestId,
      "payload-hash",
      chainId,
      "5",
      "1000000",
      "submitted",
      "submitted",
      contentId,
      now,
    ],
    sql: `
      INSERT INTO mcp_agent_ask_audit_records (
        operation_key,
        agent_id,
        client_request_id,
        payload_hash,
        chain_id,
        category_id,
        payment_amount,
        event_type,
        status,
        content_id,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });
}

function installQuoteOverrides() {
  mcpToolsModule.__setMcpToolTestOverridesForTests({
    preflightX402QuestionSubmission: async () => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: OPERATION_KEY,
        payloadHash: "payload-hash",
      },
      paymentAmount: 1_000_000n,
      resolvedCategoryIds: [5n],
      submissionKeys: [`0x${"2".repeat(64)}` as const],
    }),
    resolveX402QuestionConfig: () =>
      ({
        usdcAddress: "0x0000000000000000000000000000000000000001",
      }) as never,
  });
}

function installAskOverrides() {
  installQuoteOverrides();
  mcpToolsModule.__setMcpToolTestOverridesForTests({
    getMcpAgentBudgetSummary: async () => ({
      agentId: "route-agent",
      dailyBudgetAtomic: "5000000",
      perAskLimitAtomic: "1000000",
      remainingDailyBudgetAtomic: "4000000",
      spentTodayAtomic: "1000000",
    }),
    handleManagedQuestionSubmissionRequest: async () => ({
      body: {
        contentId: "42",
        contentIds: ["42"],
        operationKey: OPERATION_KEY,
        payment: {
          amount: "1000000",
          asset: "0x0000000000000000000000000000000000000001",
          serviceFeeAmount: "0",
        },
        status: "submitted",
      },
      status: 200,
    }),
    preflightX402QuestionSubmission: async () => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: OPERATION_KEY,
        payloadHash: "payload-hash",
      },
      paymentAmount: 1_000_000n,
      resolvedCategoryIds: [5n],
      submissionKeys: [`0x${"2".repeat(64)}` as const],
    }),
    reserveMcpAgentBudget: async () =>
      ({
        agentId: "route-agent",
        categoryId: "5",
        chainId: 42220,
        clientRequestId: "ask-http",
        contentId: null,
        createdAt: new Date(),
        error: null,
        operationKey: OPERATION_KEY,
        paymentAmount: "1000000",
        payloadHash: "payload-hash",
        status: "reserved",
        updatedAt: new Date(),
      }) as never,
    resolveX402QuestionConfig: () =>
      ({
        usdcAddress: "0x0000000000000000000000000000000000000001",
      }) as never,
    updateMcpBudgetReservation: async () => null,
  });
}

before(async () => {
  env.NODE_ENV = "development";
  configureAgent();
  dbModule = await import("../../../lib/db");
  dbTestMemory = await import("../../../lib/db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  mcpBudgetModule = await import("~~/lib/mcp/budget");
  mcpToolsModule = await import("~~/lib/mcp/tools");
  urlSafetyModule = await import("~~/utils/urlSafety");
  asksByClientAuditRoute = await import("./asks/by-client-request/audit/route");
  asksByClientRoute = await import("./asks/by-client-request/route");
  asksAuditRoute = await import("./asks/[operationKey]/audit/route");
  asksExportRoute = await import("./asks/export/route");
  asksOperationRoute = await import("./asks/[operationKey]/route");
  asksRoute = await import("./asks/route");
  callbackDeliveryModule = await import("~~/lib/agent-callbacks/delivery");
  callbackEventsModule = await import("~~/lib/agent-callbacks/events");
  callbackLifecycleModule = await import("~~/lib/agent-callbacks/lifecycle");
  callbackRegistryModule = await import("~~/lib/agent-callbacks/registry");
  quoteRoute = await import("./quote/route");
  resultsByClientRoute = await import("./results/by-client-request/route");
  resultsOperationRoute = await import("./results/[operationKey]/route");
  templatesRoute = await import("./templates/route");
});

beforeEach(async () => {
  env.NODE_ENV = "development";
  configureAgent();
  urlSafetyModule.__setUrlSafetyDnsResolversForTests({
    resolve4: async () => ["93.184.216.34"],
    resolve6: async () => [],
  });
  mcpToolsModule.__setMcpToolTestOverridesForTests(null);
  callbackLifecycleModule.__setAgentLifecycleTestOverridesForTests(null);
  await dbModule.dbClient.execute("DELETE FROM agent_callback_events");
  await dbModule.dbClient.execute("DELETE FROM agent_callback_subscriptions");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limits");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limit_maintenance");
  await dbModule.dbClient.execute("DELETE FROM mcp_agent_ask_audit_records");
  await dbModule.dbClient.execute("DELETE FROM mcp_agent_budget_reservations");
  await dbModule.dbClient.execute("DELETE FROM x402_question_submissions");
});

after(() => {
  urlSafetyModule.__setUrlSafetyDnsResolversForTests(null);
  mcpToolsModule.__setMcpToolTestOverridesForTests(null);
  dbModule.__setDatabaseResourcesForTests(null);
  restoreEnv("CURYO_MCP_AGENTS", originalAgents);
  restoreEnv("DATABASE_URL", originalDatabaseUrl);
  restoreEnv("NODE_ENV", originalNodeEnv);
});

test("agent templates require bearer auth and return a structured auth error", async () => {
  const response = await templatesRoute.GET(
    new NextRequest("https://curyo.xyz/api/agent/templates", { method: "GET" }),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 401);
  assert.equal(body.code, "transport_auth_required");
  assert.match(
    response.headers.get("www-authenticate") ?? "",
    /resource_metadata="https:\/\/curyo\.xyz\/\.well-known\/oauth-protected-resource"/,
  );
});

test("agent quote route returns a direct authenticated quote response", async () => {
  installQuoteOverrides();

  const response = await quoteRoute.POST(makePost("https://curyo.xyz/api/agent/quote", questionPayload("quote-http")));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.clientRequestId, "quote-http");
  assert.equal(body.operationKey, OPERATION_KEY);
  assert.deepEqual(body.resolvedCategoryIds, ["5"]);
  assert.equal((body.fastLane as Record<string, unknown>).recommendedAction, "adjust_round_window");
  assert.equal((body.fastLane as Record<string, unknown>).pricingConfidence, "medium");
});

test("agent asks route returns the managed submission response", async () => {
  installAskOverrides();

  const response = await asksRoute.POST(
    makePost("https://curyo.xyz/api/agent/asks", {
      ...questionPayload("ask-http"),
      maxPaymentAmount: "1500000",
    }),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.status, "submitted");
  assert.equal(body.contentId, "42");
  assert.equal(body.operationKey, OPERATION_KEY);
});

test("agent asks route returns stable direct HTTP error payloads", async () => {
  installQuoteOverrides();
  mcpToolsModule.__setMcpToolTestOverridesForTests({
    preflightX402QuestionSubmission: async () => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: OPERATION_KEY,
        payloadHash: "payload-hash",
      },
      paymentAmount: 1_000_000n,
      resolvedCategoryIds: [5n],
      submissionKeys: [`0x${"2".repeat(64)}` as const],
    }),
    reserveMcpAgentBudget: async () => {
      throw new mcpBudgetModule.McpBudgetError("This MCP agent is not allowed to ask in the selected category.", 403);
    },
    resolveX402QuestionConfig: () =>
      ({
        usdcAddress: "0x0000000000000000000000000000000000000001",
      }) as never,
  });

  const response = await asksRoute.POST(
    makePost("https://curyo.xyz/api/agent/asks", {
      ...questionPayload("ask-http"),
      maxPaymentAmount: "1500000",
    }),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 403);
  assert.equal(body.code, "category_disallowed");
  assert.equal(body.originalCode, "McpBudgetError");
});

test("agent status route returns not_found without treating it as a transport error", async () => {
  const response = await asksByClientRoute.GET(
    makeGet("https://curyo.xyz/api/agent/asks/by-client-request?chainId=42220&clientRequestId=missing"),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.status, "not_found");
  assert.equal(body.ready, false);
  assert.equal(body.terminal, true);
});

test("lifecycle sweep uses submitted x402 state even when reservation bookkeeping is stale", async () => {
  await dbModule.dbClient.execute({
    args: [
      OPERATION_KEY,
      "route-agent",
      "stale-reservation",
      "payload-hash",
      42220,
      "5",
      "1000000",
      "reserved",
      null,
      null,
      new Date("2026-04-23T12:00:00.000Z"),
      new Date("2026-04-23T12:00:00.000Z"),
    ],
    sql: `
      INSERT INTO mcp_agent_budget_reservations (
        operation_key,
        agent_id,
        client_request_id,
        payload_hash,
        chain_id,
        category_id,
        payment_amount,
        status,
        content_id,
        error,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });
  await dbModule.dbClient.execute({
    args: [
      OPERATION_KEY,
      "mcp:stale-reservation",
      "payload-hash",
      42220,
      "0x0000000000000000000000000000000000000001",
      "1000000",
      "1000000",
      "0",
      1,
      "submitted",
      "42",
      new Date("2026-04-23T12:00:00.000Z"),
      new Date("2026-04-23T12:00:00.000Z"),
      new Date("2026-04-23T12:05:00.000Z"),
    ],
    sql: `
      INSERT INTO x402_question_submissions (
        operation_key,
        client_request_id,
        payload_hash,
        chain_id,
        payment_asset,
        payment_amount,
        bounty_amount,
        service_fee_amount,
        question_count,
        status,
        content_id,
        created_at,
        updated_at,
        submitted_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });
  await callbackRegistryModule.upsertAgentCallbackSubscription({
    agentId: "route-agent",
    callbackUrl: "https://agent.example/curyo",
    eventTypes: ["question.open"],
    id: "sub-open",
    secret: "callback-secret",
  });
  callbackLifecycleModule.__setAgentLifecycleTestOverridesForTests({
    getContentById: async () =>
      ({
        audienceContext: null,
        content: {
          openRound: {
            estimatedSettlementTime: "4700000500",
            roundId: "7",
          },
        },
        ratings: [],
        rounds: [],
      }) as never,
    listContentFeedback: async () =>
      ({
        items: [],
      }) as never,
  });

  const result = await callbackLifecycleModule.sweepAgentLifecycleCallbacks({
    now: new Date("2026-04-23T12:06:00.000Z"),
  });
  const deliveries = await callbackEventsModule.listAgentCallbackEventsByEventIdPrefix({
    agentId: "route-agent",
    eventIdPrefix: `${OPERATION_KEY}:`,
  });

  assert.equal(result.emitted.questionOpen, 1);
  assert.deepEqual(
    deliveries.map(delivery => delivery.eventType),
    ["question.open"],
  );
});

test("agent audit route returns ask-centric audit details", async () => {
  await seedManagedAskAudit({ clientRequestId: "audit-http" });
  await callbackRegistryModule.upsertAgentCallbackSubscription({
    agentId: "route-agent",
    callbackUrl: "https://agent.example/curyo",
    eventTypes: ["question.submitted"],
    id: "sub-a",
    secret: "callback-secret",
  });
  await callbackEventsModule.enqueueAgentCallbackEvent({
    agentId: "route-agent",
    eventId: `${OPERATION_KEY}:question.submitted`,
    eventType: "question.submitted",
    now: new Date("2026-04-23T12:00:01.000Z"),
    payload: {
      operationKey: OPERATION_KEY,
      status: "submitted",
    },
  });

  const response = await asksAuditRoute.GET(makeGet(`https://curyo.xyz/api/agent/asks/${OPERATION_KEY}/audit`), {
    params: Promise.resolve({ operationKey: OPERATION_KEY }),
  });
  const body = (await response.json()) as {
    auditEvents: Array<Record<string, unknown>>;
    callbackDeliveries: Array<Record<string, unknown>>;
    operationKey: string;
    reservation: Record<string, unknown>;
    status: string;
    submission: Record<string, unknown> | null;
  };

  assert.equal(response.status, 200);
  assert.equal(body.operationKey, OPERATION_KEY);
  assert.equal(body.status, "submitted");
  assert.equal(body.reservation.clientRequestId, "audit-http");
  assert.equal(body.submission?.status, "submitted");
  assert.equal(body.auditEvents.length, 2);
  assert.equal(body.auditEvents[0]?.eventType, "reserved");
  assert.equal(body.callbackDeliveries.length, 1);
});

test("agent audit by client request route resolves the same managed ask", async () => {
  await seedManagedAskAudit({ clientRequestId: "audit-client-http" });

  const response = await asksByClientAuditRoute.GET(
    makeGet("https://curyo.xyz/api/agent/asks/by-client-request/audit?chainId=42220&clientRequestId=audit-client-http"),
  );
  const body = (await response.json()) as {
    clientRequestId: string;
    operationKey: string;
    status: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.clientRequestId, "audit-client-http");
  assert.equal(body.operationKey, OPERATION_KEY);
  assert.equal(body.status, "submitted");
});

test("agent audit export route returns csv rows for the authenticated agent", async () => {
  await seedManagedAskAudit({ clientRequestId: "audit-export-http" });

  const response = await asksExportRoute.GET(
    makeGet("https://curyo.xyz/api/agent/asks/export?format=csv&eventType=submitted&limit=10"),
  );
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
  assert.match(body, /operationKey,clientRequestId,chainId/);
  assert.match(body, /audit-export-http/);
  assert.match(body, /submitted/);
});

test("agent status route surfaces callback delivery state for missed webhooks", async () => {
  await callbackRegistryModule.upsertAgentCallbackSubscription({
    agentId: "route-agent",
    callbackUrl: "https://agent.example/curyo",
    eventTypes: ["question.submitted"],
    id: "sub-a",
    secret: "callback-secret",
  });
  await callbackEventsModule.enqueueAgentCallbackEvent({
    agentId: "route-agent",
    eventId: `${OPERATION_KEY}:question.submitted`,
    eventType: "question.submitted",
    now: new Date("2026-04-23T12:00:00.000Z"),
    payload: {
      operationKey: OPERATION_KEY,
      status: "submitted",
    },
  });
  await callbackDeliveryModule.leaseDueAgentCallbackEvents({
    now: new Date("2026-04-23T12:00:01.000Z"),
    workerId: "worker-a",
  });
  await callbackDeliveryModule.failAgentCallbackDelivery({
    error: "503",
    eventKey: `sub-a:${OPERATION_KEY}:question.submitted`,
    now: new Date("2026-04-23T12:00:02.000Z"),
    workerId: "worker-a",
  });

  const response = await asksOperationRoute.GET(makeGet(`https://curyo.xyz/api/agent/asks/${OPERATION_KEY}`), {
    params: Promise.resolve({ operationKey: OPERATION_KEY }),
  });
  const body = (await response.json()) as {
    callbackDeliveries: Array<Record<string, unknown>>;
    status: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.status, "not_found");
  assert.deepEqual(body.callbackDeliveries, [
    {
      attemptCount: 1,
      callbackUrl: "https://agent.example/curyo",
      deliveredAt: null,
      eventId: `${OPERATION_KEY}:question.submitted`,
      eventType: "question.submitted",
      lastError: "503",
      nextAttemptAt: "2026-04-23T12:00:03.000Z",
      status: "retrying",
      subscriptionId: "sub-a",
    },
  ]);
});

test("agent status route includes live ask guidance for underfunded open markets", async () => {
  await dbModule.dbClient.execute({
    args: [
      OPERATION_KEY,
      "status-guidance",
      "payload-hash",
      42220,
      "0x0000000000000000000000000000000000000001",
      "1000000",
      "1000000",
      "0",
      1,
      "submitted",
      "42",
      new Date("2026-04-23T12:00:00.000Z"),
      new Date("2026-04-23T12:00:00.000Z"),
    ],
    sql: `
      INSERT INTO x402_question_submissions (
        operation_key,
        client_request_id,
        payload_hash,
        chain_id,
        payment_asset,
        payment_amount,
        bounty_amount,
        service_fee_amount,
        question_count,
        status,
        content_id,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  });

  mcpToolsModule.__setMcpToolTestOverridesForTests({
    getContentById: async () =>
      ({
        audienceContext: null,
        content: {
          categoryId: "5",
          conservativeRatingBps: 5000,
          contentHash: `0x${"1".repeat(64)}`,
          createdAt: "1",
          description: "Would this make you want to learn more?",
          id: "42",
          lastActivityAt: "2",
          openRound: {
            confidenceMass: "0",
            conservativeRatingBps: 5000,
            downCount: 0,
            downPool: "0",
            effectiveEvidence: "0",
            epochDuration: 1200,
            estimatedSettlementTime: "4700000500",
            lowSince: "1700000100",
            maxDuration: 7200,
            maxVoters: 50,
            minVoters: 3,
            ratingBps: 5000,
            referenceRatingBps: 5000,
            revealedCount: 1,
            roundId: "1",
            settledRounds: 0,
            startTime: "1699998800",
            totalStake: "1000",
            upCount: 1,
            upPool: "1000",
            voteCount: 1,
          },
          questionMetadataHash: `0x${"2".repeat(64)}`,
          rating: 50,
          ratingBps: 5000,
          ratingConfidenceMass: "0",
          ratingEffectiveEvidence: "0",
          ratingLowSince: "0",
          ratingSettledRounds: 0,
          resultSpecHash: null,
          rewardPoolSummary: {
            activeRewardPoolCount: 1,
            activeUnallocatedAmount: "1000000",
            claimableAllocatedAmount: "0",
            currentRewardPoolAmount: "1000000",
            currency: "USDC",
            decimals: 6,
            displayCurrency: "USD",
            expiredRewardPoolCount: 0,
            expiredUnallocatedAmount: "0",
            hasActiveBounty: true,
            nextBountyClosesAt: "4700001800",
            nextFeedbackClosesAt: null,
            qualifiedRoundCount: 0,
            rewardPoolCount: 1,
            totalAllocatedAmount: "0",
            totalClaimedAmount: "0",
            totalFrontendClaimedAmount: "0",
            totalFundedAmount: "1000000",
            totalRefundedAmount: "0",
            totalUnallocatedAmount: "1000000",
            totalVoterClaimedAmount: "0",
          },
          roundEpochDuration: 1200,
          roundMaxDuration: 7200,
          roundMaxVoters: 50,
          roundMinVoters: 3,
          status: 0,
          submitter: `0x${"3".repeat(40)}`,
          tags: "agent,pitch",
          title: "Pitch interest",
          totalRounds: 1,
          totalVotes: 1,
          url: "https://example.com/pitch",
        },
        ratings: [],
        rounds: [],
      }) as never,
  });

  const response = await asksOperationRoute.GET(makeGet(`https://curyo.xyz/api/agent/asks/${OPERATION_KEY}`), {
    params: Promise.resolve({ operationKey: OPERATION_KEY }),
  });
  const body = (await response.json()) as {
    liveAskGuidance: {
      lowResponseRisk: string;
      recommendedAction: string;
      suggestedTopUpAtomic: string | null;
    } | null;
    status: string;
  };

  assert.equal(response.status, 200);
  assert.equal(body.status, "submitted");
  assert.deepEqual(body.liveAskGuidance, {
    lowResponseRisk: "high",
    reasonCodes: ["quorum_not_reached", "low_response_persisting", "bounty_below_healthy_target"],
    recommendedAction: "top_up",
    suggestedTopUpAtomic: "500000",
  });
});

test("agent results route returns the pending result package before settlement", async () => {
  const response = await resultsByClientRoute.GET(
    makeGet("https://curyo.xyz/api/agent/results/by-client-request?chainId=42220&clientRequestId=missing"),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.ready, false);
  assert.equal(body.answer, "pending");
  assert.equal(body.liveAskGuidance, null);
  assert.equal(body.recommendedNextAction, "wait_for_settlement");
  assert.deepEqual(body.wait, {
    code: "still_settling",
    recoverWith: "curyo_get_question_status",
  });
});

test("agent results routes accept contentId for bundle lookups", async () => {
  await seedManagedAskAudit({ clientRequestId: "bundle-result-http", contentId: "42" });
  await dbModule.dbClient.execute({
    args: [JSON.stringify(["42", "99"]), "bundle-result-http"],
    sql: `
      UPDATE x402_question_submissions
      SET content_ids = ?
      WHERE client_request_id = ?
    `,
  });

  mcpToolsModule.__setMcpToolTestOverridesForTests({
    getContentById: async contentId =>
      ({
        audienceContext: null,
        content: {
          categoryId: "5",
          conservativeRatingBps: 5000,
          contentHash: `0x${"1".repeat(64)}`,
          createdAt: "1",
          description: "Would this make you want to learn more?",
          id: contentId,
          lastActivityAt: "2",
          openRound: null,
          questionMetadataHash: `0x${"2".repeat(64)}`,
          rating: 50,
          resultSpecHash: null,
          rewardPoolSummary: null,
          status: 0,
          submitter: `0x${"3".repeat(40)}`,
          tags: "agent,pitch",
          title: "Pitch interest",
          totalRounds: 1,
          totalVotes: 1,
          url: "https://example.com/pitch",
        },
        ratings: [],
        rounds: [],
      }) as never,
  });

  const byClientResponse = await resultsByClientRoute.GET(
    makeGet(
      "https://curyo.xyz/api/agent/results/by-client-request?chainId=42220&clientRequestId=bundle-result-http&contentId=99",
    ),
  );
  const byClientBody = (await byClientResponse.json()) as {
    operation: {
      contentIds: string[];
    } | null;
    publicUrl: string | null;
  };

  assert.equal(byClientResponse.status, 200);
  assert.equal(byClientBody.publicUrl, "http://localhost:3000/rate?content=99");
  assert.deepEqual(byClientBody.operation?.contentIds, ["42", "99"]);

  const byOperationResponse = await resultsOperationRoute.GET(
    makeGet(`https://curyo.xyz/api/agent/results/${OPERATION_KEY}?contentId=99`),
    {
      params: Promise.resolve({ operationKey: OPERATION_KEY }),
    },
  );
  const byOperationBody = (await byOperationResponse.json()) as {
    publicUrl: string | null;
  };

  assert.equal(byOperationResponse.status, 200);
  assert.equal(byOperationBody.publicUrl, "http://localhost:3000/rate?content=99");
});

test("agent templates route returns supported result templates", async () => {
  const response = await templatesRoute.GET(makeGet("https://curyo.xyz/api/agent/templates"));
  const body = (await response.json()) as {
    templates: Array<{
      bundleStrategy: string;
      id: string;
      submissionPattern: string;
      templateInputsExample: Record<string, unknown> | null;
      templateInputsSchema: Record<string, unknown>;
    }>;
  };

  assert.equal(response.status, 200);
  assert.ok(body.templates.length > 0);
  assert.equal(body.templates[0]?.id, "generic_rating");
  assert.equal(body.templates[0]?.submissionPattern, "single_question");
  assert.equal(body.templates[0]?.bundleStrategy, "independent");
  assert.equal(body.templates[0]?.templateInputsExample?.goal, "quick human interest check");
  assert.equal(body.templates[0]?.templateInputsSchema.type, "object");
});
