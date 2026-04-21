import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { GET } from "./route";

const env = process.env as Record<string, string | undefined>;
const originalAuthorizationServerUrl = env.CURYO_MCP_AUTHORIZATION_SERVER_URL;

function request() {
  return new NextRequest("https://curyo.xyz/.well-known/oauth-protected-resource");
}

beforeEach(() => {
  delete env.CURYO_MCP_AUTHORIZATION_SERVER_URL;
});

after(() => {
  if (originalAuthorizationServerUrl === undefined) {
    delete env.CURYO_MCP_AUTHORIZATION_SERVER_URL;
  } else {
    env.CURYO_MCP_AUTHORIZATION_SERVER_URL = originalAuthorizationServerUrl;
  }
});

test("protected resource metadata defaults to pre-registered bearer token mode", async () => {
  const response = await GET(request());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.resource, "https://curyo.xyz/api/mcp");
  assert.equal(body.authorization_servers, undefined);
  assert.deepEqual(body.bearer_token_authentication, {
    mode: "pre_registered",
  });
});

test("protected resource metadata advertises configured authorization server", async () => {
  env.CURYO_MCP_AUTHORIZATION_SERVER_URL = "https://auth.example.com";

  const response = await GET(request());
  const body = await response.json();

  assert.deepEqual(body.authorization_servers, ["https://auth.example.com"]);
});
