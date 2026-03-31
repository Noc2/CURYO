import { NextRequest } from "next/server";
import { getMcpSessionChallengeRateLimitKeyParts } from "../../app/api/mcp/session/challenge/route";
import { verifyMcpSessionToken } from "@curyo/node-utils/mcpSessionToken";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalSessionSecret = process.env.CURYO_MCP_HTTP_SESSION_SECRET;
const originalSessionKeyId = process.env.CURYO_MCP_HTTP_SESSION_KEY_ID;
const originalSessionIssuer = process.env.CURYO_MCP_HTTP_SESSION_ISSUER;
const originalSessionAudience = process.env.CURYO_MCP_HTTP_SESSION_AUDIENCE;
const originalSessionBindings = process.env.CURYO_MCP_SESSION_WALLET_BINDINGS;
const originalSessionTtlMs = process.env.CURYO_MCP_SESSION_TTL_MS;

type DbModule = typeof import("../db");
type DbTestMemoryModule = typeof import("../db/testMemory");
type ChallengeRouteModule = typeof import("../../app/api/mcp/session/challenge/route");
type TokenRouteModule = typeof import("../../app/api/mcp/session/token/route");
type McpSessionAuthModule = typeof import("./mcpSessionAuth");

let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let challengeRoute: ChallengeRouteModule;
let tokenRoute: TokenRouteModule;
let mcpSessionAuth: McpSessionAuthModule;

function makePostRequest(pathname: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${pathname}`, {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
    }),
    body: JSON.stringify(body),
  });
}

before(async () => {
  env.DATABASE_URL = "memory:";
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  challengeRoute = await import("../../app/api/mcp/session/challenge/route");
  tokenRoute = await import("../../app/api/mcp/session/token/route");
  mcpSessionAuth = await import("./mcpSessionAuth");
});

beforeEach(async () => {
  env.NODE_ENV = "development";
  env.CURYO_MCP_HTTP_SESSION_SECRET = "nextjs-session-secret";
  env.CURYO_MCP_HTTP_SESSION_KEY_ID = "nextjs-prod";
  env.CURYO_MCP_HTTP_SESSION_ISSUER = "curyo-nextjs";
  env.CURYO_MCP_HTTP_SESSION_AUDIENCE = "curyo-mcp";
  env.CURYO_MCP_SESSION_TTL_MS = "900000";
  await dbModule.dbClient.execute("DELETE FROM signed_action_challenges");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);

  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }

  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }

  if (originalSessionSecret === undefined) {
    delete env.CURYO_MCP_HTTP_SESSION_SECRET;
  } else {
    env.CURYO_MCP_HTTP_SESSION_SECRET = originalSessionSecret;
  }

  if (originalSessionKeyId === undefined) {
    delete env.CURYO_MCP_HTTP_SESSION_KEY_ID;
  } else {
    env.CURYO_MCP_HTTP_SESSION_KEY_ID = originalSessionKeyId;
  }

  if (originalSessionIssuer === undefined) {
    delete env.CURYO_MCP_HTTP_SESSION_ISSUER;
  } else {
    env.CURYO_MCP_HTTP_SESSION_ISSUER = originalSessionIssuer;
  }

  if (originalSessionAudience === undefined) {
    delete env.CURYO_MCP_HTTP_SESSION_AUDIENCE;
  } else {
    env.CURYO_MCP_HTTP_SESSION_AUDIENCE = originalSessionAudience;
  }

  if (originalSessionBindings === undefined) {
    delete env.CURYO_MCP_SESSION_WALLET_BINDINGS;
  } else {
    env.CURYO_MCP_SESSION_WALLET_BINDINGS = originalSessionBindings;
  }

  if (originalSessionTtlMs === undefined) {
    delete env.CURYO_MCP_SESSION_TTL_MS;
  } else {
    env.CURYO_MCP_SESSION_TTL_MS = originalSessionTtlMs;
  }
});

test("normalizeMcpSessionRequest normalizes and de-duplicates scopes", () => {
  const normalized = mcpSessionAuth.normalizeMcpSessionRequest({
    address: "0x1234567890abcdef1234567890abcdef12345678",
    scopes: ["mcp:write:vote", "mcp:read", "mcp:write:vote"],
    clientName: "Claude Desktop",
  });

  assert.deepEqual(normalized, {
    ok: true,
    payload: {
      normalizedAddress: "0x1234567890abcdef1234567890abcdef12345678",
      scopes: ["mcp:read", "mcp:write:vote"],
      clientName: "Claude Desktop",
    },
  });
});

test("mcp session challenge rate-limit keys use canonicalized request parts", () => {
  const first = mcpSessionAuth.normalizeMcpSessionRequest({
    address: "0x1234567890ABCDEF1234567890ABCDEF12345678",
    scopes: ["mcp:write:vote", "mcp:read", "mcp:write:vote"],
    clientName: "  Claude Desktop  ",
  });
  const second = mcpSessionAuth.normalizeMcpSessionRequest({
    address: "0x1234567890abcdef1234567890abcdef12345678",
    scopes: ["mcp:read", "mcp:write:vote"],
    clientName: "Claude Desktop",
  });

  assert.deepEqual(first, second);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) {
    return;
  }

  assert.deepEqual(getMcpSessionChallengeRateLimitKeyParts(first.payload), [
    "0x1234567890abcdef1234567890abcdef12345678",
    "mcp:read,mcp:write:vote",
    "Claude Desktop",
  ]);
});

test("challenge and token routes mint a wallet-bound MCP bearer session", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  env.CURYO_MCP_SESSION_WALLET_BINDINGS = JSON.stringify([
    {
      walletAddress: account.address,
      identityId: "writer-1",
      scopes: ["mcp:read", "mcp:write:vote"],
      label: "Hosted writer",
    },
  ]);

  const challengeResponse = await challengeRoute.POST(
    makePostRequest("/api/mcp/session/challenge", {
      address: account.address,
      scopes: ["mcp:read", "mcp:write:vote"],
      clientName: "claude-desktop",
    }),
  );

  assert.equal(challengeResponse.status, 200);
  const challenge = (await challengeResponse.json()) as {
    challengeId: string;
    message: string;
    requestedScopes: string[];
  };
  assert.deepEqual(challenge.requestedScopes, ["mcp:read", "mcp:write:vote"]);

  const signature = await account.signMessage({ message: challenge.message });
  const tokenResponse = await tokenRoute.POST(
    makePostRequest("/api/mcp/session/token", {
      address: account.address,
      scopes: ["mcp:read", "mcp:write:vote"],
      clientName: "claude-desktop",
      challengeId: challenge.challengeId,
      signature,
    }),
  );

  assert.equal(tokenResponse.status, 200);
  const tokenBody = (await tokenResponse.json()) as {
    accessToken: string;
    tokenType: string;
    clientId: string;
    subject: string;
    scopes: string[];
    identityId: string | null;
    label: string | null;
  };

  assert.equal(tokenBody.tokenType, "Bearer");
  assert.equal(tokenBody.clientId, `wallet:${account.address.toLowerCase()}:claude-desktop`);
  assert.equal(tokenBody.subject, account.address.toLowerCase());
  assert.deepEqual(tokenBody.scopes, ["mcp:read", "mcp:write:vote"]);
  assert.equal(tokenBody.identityId, "writer-1");
  assert.equal(tokenBody.label, "Hosted writer");

  const verified = verifyMcpSessionToken(tokenBody.accessToken, {
    keys: [
      {
        keyId: "nextjs-prod",
        secret: "nextjs-session-secret",
        issuer: "curyo-nextjs",
        audience: "curyo-mcp",
      },
    ],
  });

  assert.equal(verified.claims.sub, account.address.toLowerCase());
  assert.equal(verified.claims.clientId, `wallet:${account.address.toLowerCase()}:claude-desktop`);
  assert.deepEqual(verified.claims.scopes, ["mcp:read", "mcp:write:vote"]);
  assert.equal(verified.claims.identityId, "writer-1");
});

test("challenge route rejects wallets outside the configured MCP session bindings", async () => {
  env.CURYO_MCP_SESSION_WALLET_BINDINGS = JSON.stringify([
    {
      walletAddress: "0x1111111111111111111111111111111111111111",
      identityId: "writer-1",
      scopes: ["mcp:read", "mcp:write:vote"],
    },
  ]);

  const response = await challengeRoute.POST(
    makePostRequest("/api/mcp/session/challenge", {
      address: "0x2222222222222222222222222222222222222222",
      scopes: ["mcp:read"],
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "This wallet is not configured for MCP sessions",
  });
});

test("challenge route rejects scopes that exceed the wallet binding", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  env.CURYO_MCP_SESSION_WALLET_BINDINGS = JSON.stringify([
    {
      walletAddress: account.address,
      scopes: ["mcp:read"],
    },
  ]);

  const response = await challengeRoute.POST(
    makePostRequest("/api/mcp/session/challenge", {
      address: account.address,
      scopes: ["mcp:read", "mcp:write:vote"],
    }),
  );

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: "Requested MCP scopes are not allowed for this wallet: mcp:write:vote",
  });
});
