import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, beforeEach, test } from "node:test";
import { MCP_SCOPES, McpAuthError, authenticateMcpRequest, getConfiguredMcpAgents } from "./auth";

const env = process.env as Record<string, string | undefined>;
const originalAgents = env.CURYO_MCP_AGENTS;
const originalBearerToken = env.CURYO_MCP_BEARER_TOKEN;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requestWithToken(token?: string) {
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new Request("https://curyo.xyz/api/mcp", { headers });
}

beforeEach(() => {
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
});

after(() => {
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
});

test("getConfiguredMcpAgents loads hashed bearer agents", () => {
  const [agent] = getConfiguredMcpAgents();

  assert.equal(agent.id, "agent-a");
  assert.equal(agent.dailyBudgetAtomic, 5_000_000n);
  assert.equal(agent.perAskLimitAtomic, 1_000_000n);
  assert.equal(agent.scopes.has(MCP_SCOPES.ask), true);
});

test("authenticateMcpRequest accepts valid bearer token and scope", () => {
  const agent = authenticateMcpRequest(requestWithToken("secret-token"), MCP_SCOPES.ask);

  assert.equal(agent.id, "agent-a");
});

test("authenticateMcpRequest rejects missing scopes", () => {
  assert.throws(
    () => authenticateMcpRequest(requestWithToken("secret-token"), MCP_SCOPES.balance),
    (error: unknown) => error instanceof McpAuthError && error.status === 403,
  );
});

test("authenticateMcpRequest rejects invalid bearer tokens", () => {
  assert.throws(
    () => authenticateMcpRequest(requestWithToken("wrong"), MCP_SCOPES.ask),
    (error: unknown) => error instanceof McpAuthError && error.status === 401,
  );
});
