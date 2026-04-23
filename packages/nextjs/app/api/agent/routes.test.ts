import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalAgents = env.CURYO_MCP_AGENTS;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;

env.DATABASE_URL = "memory:";

type AgentAsksByClientRouteModule = typeof import("./asks/by-client-request/route");
type AgentAsksOperationRouteModule = typeof import("./asks/[operationKey]/route");
type AgentAsksRouteModule = typeof import("./asks/route");
type AgentQuoteRouteModule = typeof import("./quote/route");
type AgentResultsByClientRouteModule = typeof import("./results/by-client-request/route");
type AgentTemplatesRouteModule = typeof import("./templates/route");
type CallbackDeliveryModule = typeof import("~~/lib/agent-callbacks/delivery");
type CallbackEventsModule = typeof import("~~/lib/agent-callbacks/events");
type CallbackRegistryModule = typeof import("~~/lib/agent-callbacks/registry");
type DbModule = typeof import("../../../lib/db");
type DbTestMemoryModule = typeof import("../../../lib/db/testMemory");
type McpBudgetModule = typeof import("~~/lib/mcp/budget");
type McpToolsModule = typeof import("~~/lib/mcp/tools");

const OPERATION_KEY = `0x${"1".repeat(64)}` as const;

let asksByClientRoute: AgentAsksByClientRouteModule;
let asksOperationRoute: AgentAsksOperationRouteModule;
let asksRoute: AgentAsksRouteModule;
let callbackDeliveryModule: CallbackDeliveryModule;
let callbackEventsModule: CallbackEventsModule;
let callbackRegistryModule: CallbackRegistryModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let mcpBudgetModule: McpBudgetModule;
let mcpToolsModule: McpToolsModule;
let quoteRoute: AgentQuoteRouteModule;
let resultsByClientRoute: AgentResultsByClientRouteModule;
let templatesRoute: AgentTemplatesRouteModule;

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
  asksByClientRoute = await import("./asks/by-client-request/route");
  asksOperationRoute = await import("./asks/[operationKey]/route");
  asksRoute = await import("./asks/route");
  callbackDeliveryModule = await import("~~/lib/agent-callbacks/delivery");
  callbackEventsModule = await import("~~/lib/agent-callbacks/events");
  callbackRegistryModule = await import("~~/lib/agent-callbacks/registry");
  quoteRoute = await import("./quote/route");
  resultsByClientRoute = await import("./results/by-client-request/route");
  templatesRoute = await import("./templates/route");
});

beforeEach(async () => {
  env.NODE_ENV = "development";
  configureAgent();
  mcpToolsModule.__setMcpToolTestOverridesForTests(null);
  await dbModule.dbClient.execute("DELETE FROM agent_callback_events");
  await dbModule.dbClient.execute("DELETE FROM agent_callback_subscriptions");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limits");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limit_maintenance");
});

after(() => {
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

test("agent results route returns the pending result package before settlement", async () => {
  const response = await resultsByClientRoute.GET(
    makeGet("https://curyo.xyz/api/agent/results/by-client-request?chainId=42220&clientRequestId=missing"),
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.ready, false);
  assert.equal(body.answer, "pending");
  assert.equal(body.recommendedNextAction, "wait_for_settlement");
  assert.deepEqual(body.wait, {
    code: "still_settling",
    recoverWith: "curyo_get_question_status",
  });
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
