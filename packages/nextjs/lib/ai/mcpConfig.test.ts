import assert from "node:assert/strict";
import { test } from "node:test";
import { buildHostedMcpConfig } from "./mcpConfig";

test("buildHostedMcpConfig returns canonical hosted URLs by default", () => {
  const config = buildHostedMcpConfig({});

  assert.equal(config.endpointUrl, "https://mcp.curyo.xyz/mcp");
  assert.equal(config.healthUrl, "https://mcp.curyo.xyz/healthz");
  assert.equal(config.readinessUrl, "https://mcp.curyo.xyz/readyz");
  assert.equal(config.metricsUrl, "https://mcp.curyo.xyz/metrics");
  assert.equal(config.docsUrl, "https://curyo.xyz/docs/ai");
  assert.equal(config.browserExperiments.webmcp.status, "planned");
});

test("buildHostedMcpConfig respects environment overrides and enables the WebMCP experiment flag", () => {
  const config = buildHostedMcpConfig({
    NEXT_PUBLIC_CURLYO_MCP_BASE_URL: "https://staging-mcp.curyo.xyz/base/",
    NEXT_PUBLIC_CURLYO_MCP_PATH: "rpc/",
    NEXT_PUBLIC_SITE_URL: "https://staging.curyo.xyz/",
    NEXT_PUBLIC_ENABLE_WEBMCP_EXPERIMENT: "1",
    NEXT_PUBLIC_CURLYO_MCP_SERVER_NAME: "curyo-staging",
  });

  assert.equal(config.serverName, "curyo-staging");
  assert.equal(config.endpointUrl, "https://staging-mcp.curyo.xyz/base/rpc");
  assert.equal(config.healthUrl, "https://staging-mcp.curyo.xyz/base/healthz");
  assert.equal(config.docsUrl, "https://staging.curyo.xyz/docs/ai");
  assert.equal(config.browserExperiments.webmcp.status, "experimental");
  assert.equal(config.browserExperiments.webmcp.enabled, true);
});
