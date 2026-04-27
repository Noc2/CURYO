import { MCP_SCOPES, McpAuthError, authenticateMcpRequest, getConfiguredMcpAgents } from "./auth";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { hashMcpBearerToken } from "~~/lib/agent/policies";

const env = process.env as Record<string, string | undefined>;
const originalAgents = env.CURYO_MCP_AGENTS;
const originalBearerToken = env.CURYO_MCP_BEARER_TOKEN;
const originalDatabaseUrl = env.DATABASE_URL;
let dbModule: typeof import("../db");
let dbTestMemory: typeof import("../db/testMemory");

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requestWithToken(token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request("https://curyo.xyz/api/mcp", { headers });
}

before(async () => {
  env.DATABASE_URL = "memory:";
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
});

beforeEach(async () => {
  delete env.CURYO_MCP_BEARER_TOKEN;
  env.CURYO_MCP_AGENTS = JSON.stringify([
    {
      dailyBudgetAtomic: "5000000",
      id: "agent-a",
      perAskLimitAtomic: "1000000",
      scopes: [MCP_SCOPES.ask, MCP_SCOPES.quote, MCP_SCOPES.read],
      tokenHash: sha256("secret-token"),
    },
  ]);
  await dbModule.dbClient.execute("DELETE FROM agent_wallet_policy_audit_records");
  await dbModule.dbClient.execute("DELETE FROM agent_wallet_policies");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
  if (originalAgents === undefined) {
    delete env.CURYO_MCP_AGENTS;
  } else {
    env.CURYO_MCP_AGENTS = originalAgents;
  }

  if (originalBearerToken === undefined) {
    delete env.CURYO_MCP_BEARER_TOKEN;
  } else {
    env.CURYO_MCP_BEARER_TOKEN = originalBearerToken;
  }

  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }
});

test("getConfiguredMcpAgents loads hashed bearer agents", () => {
  const [agent] = getConfiguredMcpAgents();

  assert.equal(agent.id, "agent-a");
  assert.equal(agent.dailyBudgetAtomic, 5_000_000n);
  assert.equal(agent.perAskLimitAtomic, 1_000_000n);
  assert.equal(agent.scopes.has(MCP_SCOPES.ask), true);
});

test("authenticateMcpRequest accepts valid bearer token and scope", async () => {
  const agent = await authenticateMcpRequest(requestWithToken("secret-token"), MCP_SCOPES.ask);

  assert.equal(agent.id, "agent-a");
});

test("authenticateMcpRequest rejects missing scopes", async () => {
  await assert.rejects(
    () => authenticateMcpRequest(requestWithToken("secret-token"), MCP_SCOPES.balance),
    (error: unknown) => error instanceof McpAuthError && error.status === 403,
  );
});

test("authenticateMcpRequest rejects invalid bearer tokens", async () => {
  await assert.rejects(
    () => authenticateMcpRequest(requestWithToken("wrong"), MCP_SCOPES.ask),
    (error: unknown) => error instanceof McpAuthError && error.status === 401,
  );
});

test("authenticateMcpRequest accepts active DB-backed policy tokens", async () => {
  delete env.CURYO_MCP_AGENTS;
  await dbModule.dbClient.execute({
    sql: `
      INSERT INTO agent_wallet_policies (
        id, owner_wallet_address, agent_id, agent_wallet_address, status, scopes, categories,
        daily_budget_atomic, per_ask_limit_atomic, token_hash, token_issued_at,
        expires_at, created_at, updated_at, revoked_at
      )
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NOW(), NULL, NOW(), NOW(), NULL)
    `,
    args: [
      "agent_policy_test",
      "0x00000000000000000000000000000000000000aa",
      "research-agent",
      "0x00000000000000000000000000000000000000bb",
      JSON.stringify([MCP_SCOPES.ask, MCP_SCOPES.balance]),
      JSON.stringify(["6"]),
      "9000000",
      "3000000",
      hashMcpBearerToken("db-token"),
    ],
  });

  const agent = await authenticateMcpRequest(requestWithToken("db-token"), MCP_SCOPES.ask);

  assert.equal(agent.id, "agent_policy_test");
  assert.equal(agent.walletAddress, "0x00000000000000000000000000000000000000bb");
  assert.equal(agent.perAskLimitAtomic, 3_000_000n);
  assert.equal(agent.allowedCategoryIds?.has("6"), true);
});
