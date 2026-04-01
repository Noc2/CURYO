import { buildHostedMcpConfig } from "./mcpConfig";
import assert from "node:assert/strict";
import { test } from "node:test";

test("buildHostedMcpConfig returns canonical hosted URLs by default", () => {
  const config = buildHostedMcpConfig({});

  assert.equal(config.endpointUrl, "https://mcp.curyo.xyz/mcp");
  assert.equal(config.healthUrl, "https://mcp.curyo.xyz/healthz");
  assert.equal(config.readinessUrl, "https://mcp.curyo.xyz/readyz");
  assert.equal(config.metricsUrl, "https://mcp.curyo.xyz/metrics");
  assert.equal(config.docsUrl, "https://curyo.xyz/docs/ai");
  assert.equal(config.auth.walletSessions.enabled, false);
  assert.equal(config.auth.walletSessions.challengeUrl, "https://curyo.xyz/api/mcp/session/challenge");
  assert.equal(config.auth.walletSessions.tokenUrl, "https://curyo.xyz/api/mcp/session/token");
  assert.equal(config.auth.walletSessions.ttlSeconds, 3600);
  assert.deepEqual(config.auth.walletSessions.defaultScopes, ["mcp:read"]);
  assert.equal(config.browserExperiments.webmcp.status, "planned");
});

test("buildHostedMcpConfig respects environment overrides and enables the WebMCP experiment flag", () => {
  const config = buildHostedMcpConfig({
    NEXT_PUBLIC_CURLYO_MCP_BASE_URL: "https://staging-mcp.curyo.xyz/base/",
    NEXT_PUBLIC_CURLYO_MCP_PATH: "rpc/",
    NEXT_PUBLIC_SITE_URL: "https://staging.curyo.xyz/",
    NEXT_PUBLIC_ENABLE_WEBMCP_EXPERIMENT: "1",
    NEXT_PUBLIC_CURLYO_MCP_SERVER_NAME: "curyo-staging",
    CURYO_MCP_HTTP_SESSION_SECRET: "nextjs-session-secret",
    CURYO_MCP_SESSION_WALLET_BINDINGS:
      '[{"walletAddress":"0x1111111111111111111111111111111111111111","scopes":["mcp:read"]}]',
    CURYO_MCP_SESSION_TTL_MS: "900000",
  });

  assert.equal(config.serverName, "curyo-staging");
  assert.equal(config.endpointUrl, "https://staging-mcp.curyo.xyz/base/rpc");
  assert.equal(config.healthUrl, "https://staging-mcp.curyo.xyz/base/healthz");
  assert.equal(config.docsUrl, "https://staging.curyo.xyz/docs/ai");
  assert.equal(config.auth.walletSessions.enabled, true);
  assert.equal(config.auth.walletSessions.challengeUrl, "https://staging.curyo.xyz/api/mcp/session/challenge");
  assert.equal(config.auth.walletSessions.tokenUrl, "https://staging.curyo.xyz/api/mcp/session/token");
  assert.equal(config.auth.walletSessions.ttlSeconds, 900);
  assert.deepEqual(config.auth.walletSessions.supportedScopes, [
    "mcp:read",
    "metrics:read",
    "mcp:write",
    "mcp:write:vote",
    "mcp:write:submit_content",
    "mcp:write:claim_reward",
    "mcp:write:claim_frontend_fee",
  ]);
  assert.equal(config.browserExperiments.webmcp.status, "experimental");
  assert.equal(config.browserExperiments.webmcp.enabled, true);
});
