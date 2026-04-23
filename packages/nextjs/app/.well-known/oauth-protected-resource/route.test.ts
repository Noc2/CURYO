import { NextRequest } from "next/server";
import { GET } from "./route";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalAuthorizationServer = env.CURYO_MCP_AUTHORIZATION_SERVER_URL;

afterEach(() => {
  if (originalAuthorizationServer === undefined) {
    delete env.CURYO_MCP_AUTHORIZATION_SERVER_URL;
  } else {
    env.CURYO_MCP_AUTHORIZATION_SERVER_URL = originalAuthorizationServer;
  }
});

test("protected resource metadata describes the MCP endpoint", async () => {
  delete env.CURYO_MCP_AUTHORIZATION_SERVER_URL;

  const response = await GET(new NextRequest("https://curyo.xyz/.well-known/oauth-protected-resource"));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(body.resource, "https://curyo.xyz/api/mcp");
  assert.equal(body.resource_name, "Curyo MCP");
  assert.deepEqual(body.bearer_methods_supported, ["header"]);
  assert.deepEqual(body.scopes_supported, ["curyo:ask", "curyo:balance", "curyo:quote", "curyo:read"]);
  assert.equal("authorization_servers" in body, false);
});

test("protected resource metadata includes external authorization server when configured", async () => {
  env.CURYO_MCP_AUTHORIZATION_SERVER_URL = "https://auth.example";

  const response = await GET(new NextRequest("https://curyo.xyz/.well-known/oauth-protected-resource"));
  const body = (await response.json()) as Record<string, unknown>;

  assert.deepEqual(body.authorization_servers, ["https://auth.example"]);
});
