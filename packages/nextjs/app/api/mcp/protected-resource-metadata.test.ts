import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalAuthorizationServer = env.CURYO_MCP_AUTHORIZATION_SERVER_URL;

type ProtectedResourceRouteModule = typeof import("../../.well-known/oauth-protected-resource/[[...resource]]/route");

let protectedResourceRoute: ProtectedResourceRouteModule;

function restoreEnv(name: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

before(async () => {
  protectedResourceRoute = await import("../../.well-known/oauth-protected-resource/[[...resource]]/route");
});

beforeEach(() => {
  delete env.CURYO_MCP_AUTHORIZATION_SERVER_URL;
});

after(() => {
  restoreEnv("CURYO_MCP_AUTHORIZATION_SERVER_URL", originalAuthorizationServer);
});

function makeRequest(url = "https://curyo.xyz/.well-known/oauth-protected-resource") {
  return new NextRequest(url, { method: "GET" });
}

test("serves root MCP protected-resource metadata for static bearer-token agents", async () => {
  const response = await protectedResourceRoute.GET(makeRequest(), { params: Promise.resolve({}) });
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.resource, "https://curyo.xyz/api/mcp");
  assert.equal(body.resource_name, "Curyo MCP");
  assert.deepEqual(body.bearer_methods_supported, ["header"]);
  assert.deepEqual(body.scopes_supported, ["curyo:quote", "curyo:ask", "curyo:read", "curyo:balance"]);
  assert.equal("authorization_servers" in body, false);
});

test("includes configured authorization server in protected-resource metadata", async () => {
  env.CURYO_MCP_AUTHORIZATION_SERVER_URL = "https://auth.curyo.xyz/";

  const response = await protectedResourceRoute.GET(
    makeRequest("https://curyo.xyz/.well-known/oauth-protected-resource/api/mcp"),
    {
      params: Promise.resolve({ resource: ["api", "mcp"] }),
    },
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.resource, "https://curyo.xyz/api/mcp");
  assert.deepEqual(body.authorization_servers, ["https://auth.curyo.xyz"]);
});

test("rejects protected-resource metadata for unrelated paths", async () => {
  const response = await protectedResourceRoute.GET(
    makeRequest("https://curyo.xyz/.well-known/oauth-protected-resource/api/other"),
    {
      params: Promise.resolve({ resource: ["api", "other"] }),
    },
  );
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 404);
  assert.equal(body.error, "Unknown protected resource.");
});
