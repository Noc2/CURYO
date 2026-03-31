const DEFAULT_MCP_BASE_URL = "https://mcp.curyo.xyz";
const DEFAULT_MCP_PATH = "/mcp";
const DEFAULT_SITE_BASE_URL = "https://curyo.xyz";
const READ_TOOLS = [
  "search_content",
  "get_content",
  "get_content_by_url",
  "get_categories",
  "get_profile",
  "get_voter_accuracy",
  "get_stats",
  "search_votes",
] as const;
const WRITE_TOOLS = ["vote", "submit_content", "claim_reward", "claim_frontend_fee"] as const;

export interface HostedMcpConfig {
  serverName: string;
  endpointUrl: string;
  healthUrl: string;
  readinessUrl: string;
  metricsUrl: string;
  docsUrl: string;
  transports: string[];
  auth: {
    mode: "bearer";
    header: string;
  };
  capabilities: {
    readTools: readonly string[];
    writeTools: readonly string[];
  };
  browserExperiments: {
    webmcp: {
      enabled: boolean;
      status: "planned" | "experimental";
      flag: string;
      note: string;
    };
  };
}

type McpConfigEnv = Record<string, string | undefined>;

export function buildHostedMcpConfig(env: McpConfigEnv = process.env): HostedMcpConfig {
  const baseUrl = normalizeBaseUrl(env.NEXT_PUBLIC_CURLYO_MCP_BASE_URL || env.CURYO_MCP_PUBLIC_BASE_URL || DEFAULT_MCP_BASE_URL);
  const siteBaseUrl = normalizeBaseUrl(env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_BASE_URL);
  const path = normalizePath(env.NEXT_PUBLIC_CURLYO_MCP_PATH || env.CURYO_MCP_HTTP_PATH || DEFAULT_MCP_PATH);
  const webMcpEnabled = env.NEXT_PUBLIC_ENABLE_WEBMCP_EXPERIMENT === "1";

  return {
    serverName: env.NEXT_PUBLIC_CURLYO_MCP_SERVER_NAME || "curyo-readonly",
    endpointUrl: buildPathUrl(baseUrl, path),
    healthUrl: buildPathUrl(baseUrl, "/healthz"),
    readinessUrl: buildPathUrl(baseUrl, "/readyz"),
    metricsUrl: buildPathUrl(baseUrl, "/metrics"),
    docsUrl: buildPathUrl(siteBaseUrl, "/docs/ai"),
    transports: ["streamable-http"],
    auth: {
      mode: "bearer",
      header: "Authorization: Bearer <token>",
    },
    capabilities: {
      readTools: READ_TOOLS,
      writeTools: WRITE_TOOLS,
    },
    browserExperiments: {
      webmcp: {
        enabled: webMcpEnabled,
        status: webMcpEnabled ? "experimental" : "planned",
        flag: "NEXT_PUBLIC_ENABLE_WEBMCP_EXPERIMENT",
        note: "Keep WebMCP behind a feature flag until hosted MCP reads and hosted writes are stable in production.",
      },
    },
  };
}

function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  const trimmedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${trimmedPath}`;
}

function normalizePath(value: string): string {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash === "/" ? withLeadingSlash : withLeadingSlash.replace(/\/+$/, "");
}

function buildPathUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}
