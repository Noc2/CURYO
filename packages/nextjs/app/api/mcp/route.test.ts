import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { ROUND_STATE } from "@curyo/contracts/protocol";

const env = process.env as Record<string, string | undefined>;
const originalAgents = env.CURYO_MCP_AGENTS;
const originalAllowedOrigins = env.CURYO_MCP_ALLOWED_ORIGINS;
const originalAuthServer = env.CURYO_MCP_AUTHORIZATION_SERVER_URL;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;
const originalRateLimitHeaders = env.RATE_LIMIT_TRUSTED_IP_HEADERS;
const originalVercel = env.VERCEL;

env.DATABASE_URL = "memory:";

type RouteModule = typeof import("./route");
type DbModule = typeof import("../../../lib/db");
type DbTestMemoryModule = typeof import("../../../lib/db/testMemory");
type McpBudgetModule = typeof import("~~/lib/mcp/budget");
type McpToolsModule = typeof import("~~/lib/mcp/tools");

let route: RouteModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let mcpBudgetModule: McpBudgetModule;
let mcpToolsModule: McpToolsModule;

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

function makePost(body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("https://curyo.xyz/api/mcp", {
    body: JSON.stringify(body),
    headers: new Headers({
      authorization: "Bearer secret-token",
      "content-type": "application/json",
      ...headers,
    }),
    method: "POST",
  });
}

async function postJson(body: unknown, headers: Record<string, string> = {}) {
  const response = await route.POST(makePost(body, headers));
  return {
    body: (await response.json()) as Record<string, unknown>,
    response,
  };
}

function makeGet(headers: Record<string, string> = {}) {
  return new NextRequest("https://curyo.xyz/api/mcp", {
    headers: new Headers(headers),
    method: "GET",
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
  route = await import("./route");
});

beforeEach(async () => {
  env.NODE_ENV = "development";
  delete env.CURYO_MCP_ALLOWED_ORIGINS;
  delete env.CURYO_MCP_AUTHORIZATION_SERVER_URL;
  delete env.RATE_LIMIT_TRUSTED_IP_HEADERS;
  delete env.VERCEL;
  configureAgent();
  mcpToolsModule.__setMcpToolTestOverridesForTests(null);
  await dbModule.dbClient.execute("DELETE FROM api_rate_limits");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limit_maintenance");
});

after(() => {
  mcpToolsModule.__setMcpToolTestOverridesForTests(null);
  dbModule.__setDatabaseResourcesForTests(null);
  restoreEnv("CURYO_MCP_AGENTS", originalAgents);
  restoreEnv("CURYO_MCP_ALLOWED_ORIGINS", originalAllowedOrigins);
  restoreEnv("CURYO_MCP_AUTHORIZATION_SERVER_URL", originalAuthServer);
  restoreEnv("DATABASE_URL", originalDatabaseUrl);
  restoreEnv("NODE_ENV", originalNodeEnv);
  restoreEnv("RATE_LIMIT_TRUSTED_IP_HEADERS", originalRateLimitHeaders);
  restoreEnv("VERCEL", originalVercel);
});

test("initialize succeeds without MCP-Protocol-Version and defaults to the latest supported version", async () => {
  const { body, response } = await postJson({
    id: 1,
    jsonrpc: "2.0",
    method: "initialize",
    params: {},
  });

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    id: 1,
    jsonrpc: "2.0",
    result: {
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      protocolVersion: "2025-11-25",
      serverInfo: {
        name: "curyo",
        version: "0.1.0",
      },
    },
  });
});

test("initialize honors a supported older protocol version", async () => {
  const { body } = await postJson({
    id: "init",
    jsonrpc: "2.0",
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
    },
  });

  assert.equal((body.result as Record<string, unknown>).protocolVersion, "2025-06-18");
});

test("missing bearer tokens receive an MCP auth challenge with resource metadata", async () => {
  const response = await route.POST(
    new NextRequest("https://curyo.xyz/api/mcp", {
      body: JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        method: "initialize",
        params: {},
      }),
      headers: new Headers({ "content-type": "application/json" }),
      method: "POST",
    }),
  );

  assert.equal(response.status, 401);
  assert.match(
    response.headers.get("www-authenticate") ?? "",
    /resource_metadata="https:\/\/curyo\.xyz\/\.well-known\/oauth-protected-resource"/,
  );
});

test("post-initialize methods reject missing MCP-Protocol-Version", async () => {
  const { body, response } = await postJson({
    id: 2,
    jsonrpc: "2.0",
    method: "tools/list",
    params: {},
  });

  assert.equal(response.status, 400);
  assert.equal((body.error as Record<string, unknown>).message, "Missing MCP-Protocol-Version header.");
});

test("post-initialize methods reject unsupported MCP-Protocol-Version", async () => {
  const { body, response } = await postJson(
    {
      id: 3,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
    },
    { "mcp-protocol-version": "2024-11-05" },
  );

  assert.equal(response.status, 400);
  assert.equal((body.error as Record<string, unknown>).message, "Unsupported MCP-Protocol-Version: 2024-11-05.");
  assert.deepEqual((body.error as Record<string, unknown>).data, {
    supportedProtocolVersions: ["2025-06-18", "2025-11-25"],
  });
});

test("tools/list accepts supported MCP-Protocol-Version and returns tool annotations", async () => {
  const { body, response } = await postJson(
    {
      id: 4,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
    },
    { "mcp-protocol-version": "2025-11-25" },
  );

  const result = body.result as {
    tools: Array<{
      annotations?: Record<string, unknown>;
      inputSchema?: unknown;
      name: string;
      outputSchema?: unknown;
    }>;
  };
  const toolByName = new Map(result.tools.map(tool => [tool.name, tool]));
  assert.equal(response.status, 200);
  assert.deepEqual(toolByName.get("curyo_quote_question")?.annotations, {
    idempotentHint: true,
    openWorldHint: true,
    readOnlyHint: true,
  });
  assert.deepEqual(toolByName.get("curyo_ask_humans")?.annotations, {
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: true,
    readOnlyHint: false,
  });
  assert.ok(toolByName.get("curyo_quote_question")?.inputSchema);
  assert.ok(toolByName.get("curyo_quote_question")?.outputSchema);
  assert.ok(toolByName.get("curyo_ask_humans")?.inputSchema);
  assert.ok(toolByName.get("curyo_ask_humans")?.outputSchema);
  assert.ok(toolByName.get("curyo_get_question_status")?.outputSchema);
  assert.ok(toolByName.get("curyo_get_result")?.outputSchema);
  assert.ok(toolByName.get("curyo_get_bot_balance")?.outputSchema);
});

test("notifications require MCP-Protocol-Version after initialize", async () => {
  const response = await route.POST(
    makePost({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    }),
  );

  assert.equal(response.status, 400);
});

test("notifications with MCP-Protocol-Version receive accepted status", async () => {
  const response = await route.POST(
    makePost(
      {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      },
      { "mcp-protocol-version": "2025-11-25" },
    ),
  );

  assert.equal(response.status, 202);
});

test("GET documents supported transport and disabled SSE", async () => {
  const response = await route.GET(makeGet());
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "POST, OPTIONS");
  assert.deepEqual(body.supportedTransports, ["streamable-http"]);
});

test("invalid media returns a stable MCP tool error code", async () => {
  const { body, response } = await postJson(
    {
      id: 5,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          bounty: {
            amount: "1000000",
            asset: "USDC",
          },
          chainId: 42220,
          clientRequestId: "invalid-media-check",
          question: {
            categoryId: "5",
            contextUrl: "https://example.com/context",
            description: "Check media handling",
            imageUrls: ["https://example.com/not-an-image"],
            tags: ["agents"],
            title: "Invalid media",
          },
        },
        name: "curyo_quote_question",
      },
    },
    { "mcp-protocol-version": "2025-11-25" },
  );

  const result = body.result as Record<string, unknown>;
  const structured = result.structuredContent as Record<string, unknown>;
  assert.equal(response.status, 200);
  assert.equal(result.isError, true);
  assert.equal(structured.code, "invalid_media");
  assert.equal(structured.originalCode, "X402QuestionInputError");
});

test("category disallowed returns a stable MCP tool error code", async () => {
  env.CURYO_MCP_AGENTS = JSON.stringify([
    {
      categories: ["6"],
      dailyBudgetAtomic: "5000000",
      id: "route-agent",
      perAskLimitAtomic: "1000000",
      scopes: ["curyo:ask", "curyo:balance", "curyo:quote", "curyo:read"],
      token: "secret-token",
    },
  ]);
  mcpToolsModule.__setMcpToolTestOverridesForTests({
    preflightX402QuestionSubmission: async () => ({
      operation: {
        canonicalPayload: {} as never,
        operationKey: `0x${"1".repeat(64)}` as const,
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

  const { body } = await postJson(
    {
      id: 6,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          bounty: {
            amount: "1000000",
            asset: "USDC",
          },
          chainId: 42220,
          clientRequestId: "category-check",
          maxPaymentAmount: "1500000",
          question: {
            categoryId: "5",
            contextUrl: "https://example.com/context",
            description: "Should this ask be blocked?",
            tags: ["agents"],
            title: "Category mismatch",
          },
        },
        name: "curyo_ask_humans",
      },
    },
    { "mcp-protocol-version": "2025-11-25" },
  );

  const result = body.result as Record<string, unknown>;
  const structured = result.structuredContent as Record<string, unknown>;
  assert.equal(result.isError, true);
  assert.equal(structured.code, "category_disallowed");
  assert.equal(structured.originalCode, "McpBudgetError");
});

test("pending result returns a full pending result package", async () => {
  const { body } = await postJson(
    {
      id: 7,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          chainId: 42220,
          clientRequestId: "missing-result",
        },
        name: "curyo_get_result",
      },
    },
    { "mcp-protocol-version": "2025-11-25" },
  );

  const result = body.result as Record<string, unknown>;
  const structured = result.structuredContent as Record<string, unknown>;
  assert.equal(result.isError, false);
  assert.equal(structured.ready, false);
  assert.equal(structured.answer, "pending");
  assert.equal(structured.recommendedNextAction, "wait_for_settlement");
  assert.deepEqual(structured.wait, {
    code: "still_settling",
    recoverWith: "curyo_get_question_status",
  });
});

test("failed submissions return a terminal pending result package without a retry delay", async () => {
  const operationKey = `0x${"3".repeat(64)}`;
  const now = new Date("2026-04-23T12:00:00.000Z");

  await dbModule.dbClient.execute({
    args: [
      operationKey,
      "route-agent",
      "failed-result",
      "payload-hash",
      42220,
      "5",
      "1000000",
      "failed",
      null,
      "submission failed",
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
      "failed-result",
      "payload-hash",
      42220,
      "0x0000000000000000000000000000000000000001",
      "1000000",
      "1000000",
      "0",
      1,
      "failed",
      null,
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

  const { body } = await postJson(
    {
      id: 8,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          chainId: 42220,
          clientRequestId: "failed-result",
        },
        name: "curyo_get_result",
      },
    },
    { "mcp-protocol-version": "2025-11-25" },
  );

  const result = body.result as Record<string, unknown>;
  const structured = result.structuredContent as Record<string, unknown>;
  assert.equal(result.isError, false);
  assert.equal(structured.ready, false);
  assert.equal(structured.answer, "failed");
  assert.equal(structured.pollAfterMs, null);
  assert.equal(structured.recommendedNextAction, "manual_review");
  assert.deepEqual(structured.wait, {
    code: "failed_submission",
    recoverWith: "inspect_status_error",
  });
});

test("submitted status stays non-terminal until the latest round reaches a final state", async () => {
  const operationKey = `0x${"8".repeat(64)}`;
  const now = new Date("2026-04-23T12:00:00.000Z");

  await dbModule.dbClient.execute({
    args: [
      operationKey,
      "route-agent",
      "open-status",
      "payload-hash",
      42220,
      "5",
      "1000000",
      "submitted",
      "42",
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
      "open-status",
      "payload-hash",
      42220,
      "0x0000000000000000000000000000000000000001",
      "1000000",
      "1000000",
      "0",
      1,
      "submitted",
      "42",
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

  mcpToolsModule.__setMcpToolTestOverridesForTests({
    getContentById: async () =>
      ({
        audienceContext: null,
        content: {
          categoryId: "5",
          id: "42",
          openRound: null,
          question: "Would this pitch make you want to learn more?",
          rating: 50,
          status: 0,
          title: "Pitch interest",
          totalVotes: 0,
        },
        ratings: [],
        rounds: [
          {
            contentId: "42",
            id: "round-1",
            roundId: "1",
            state: ROUND_STATE.Open,
          },
        ],
      }) as never,
  });

  const { body } = await postJson(
    {
      id: 9,
      jsonrpc: "2.0",
      method: "tools/call",
      params: {
        arguments: {
          chainId: 42220,
          clientRequestId: "open-status",
        },
        name: "curyo_get_question_status",
      },
    },
    { "mcp-protocol-version": "2025-11-25" },
  );

  const result = body.result as Record<string, unknown>;
  const structured = result.structuredContent as Record<string, unknown>;
  assert.equal(result.isError, false);
  assert.equal(structured.ready, false);
  assert.equal(structured.terminal, false);
  assert.equal(structured.pollAfterMs, 5_000);
  assert.equal(structured.resultTool, null);
  assert.equal(structured.nextAction, "poll_curyo_get_question_status");
});
