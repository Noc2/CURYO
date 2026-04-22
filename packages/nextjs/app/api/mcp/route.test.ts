import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

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

let route: RouteModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;

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

before(async () => {
  env.NODE_ENV = "development";
  configureAgent();
  dbModule = await import("../../../lib/db");
  dbTestMemory = await import("../../../lib/db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  route = await import("./route");
});

beforeEach(async () => {
  env.NODE_ENV = "development";
  delete env.CURYO_MCP_ALLOWED_ORIGINS;
  delete env.CURYO_MCP_AUTHORIZATION_SERVER_URL;
  delete env.RATE_LIMIT_TRUSTED_IP_HEADERS;
  delete env.VERCEL;
  configureAgent();
  await dbModule.dbClient.execute("DELETE FROM api_rate_limits");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limit_maintenance");
});

after(() => {
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

test("tools/list accepts supported MCP-Protocol-Version", async () => {
  const { body, response } = await postJson(
    {
      id: 4,
      jsonrpc: "2.0",
      method: "tools/list",
      params: {},
    },
    { "mcp-protocol-version": "2025-11-25" },
  );

  const result = body.result as { tools: Array<{ name: string; outputSchema?: unknown }> };
  assert.equal(response.status, 200);
  assert.equal(
    result.tools.some(tool => tool.name === "curyo_ask_humans"),
    true,
  );
  assert.equal(
    result.tools.some(tool => tool.name === "curyo_get_result" && tool.outputSchema),
    true,
  );
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
