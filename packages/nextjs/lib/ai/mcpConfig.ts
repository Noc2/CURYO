const DEFAULT_MCP_BASE_URL = "https://mcp.curyo.xyz";
const DEFAULT_MCP_PATH = "/mcp";
const DEFAULT_SITE_BASE_URL = "https://curyo.xyz";
const DEFAULT_MCP_SESSION_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MCP_SESSION_SCOPES = ["mcp:read"] as const;
const SUPPORTED_MCP_SESSION_SCOPES = [
  "mcp:read",
  "metrics:read",
  "mcp:write",
  "mcp:write:vote",
  "mcp:write:submit_content",
  "mcp:write:claim_reward",
  "mcp:write:claim_frontend_fee",
] as const;
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

interface HostedMcpConfig {
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
    walletSessions: {
      enabled: boolean;
      challengeUrl: string;
      tokenUrl: string;
      defaultScopes: readonly string[];
      supportedScopes: readonly string[];
      ttlSeconds: number;
      note: string;
    };
  };
  capabilities: {
    readTools: readonly string[];
    writeTools: readonly string[];
  };
}

type McpConfigEnv = Record<string, string | undefined>;

export function buildHostedMcpConfig(env: McpConfigEnv = process.env): HostedMcpConfig {
  const baseUrl = normalizeBaseUrl(
    env.NEXT_PUBLIC_CURLYO_MCP_BASE_URL || env.CURYO_MCP_PUBLIC_BASE_URL || DEFAULT_MCP_BASE_URL,
  );
  const siteBaseUrl = normalizeBaseUrl(env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_BASE_URL);
  const path = normalizePath(env.NEXT_PUBLIC_CURLYO_MCP_PATH || env.CURYO_MCP_HTTP_PATH || DEFAULT_MCP_PATH);
  const walletSessionAuthEnabled = Boolean(
    env.CURYO_MCP_HTTP_SESSION_SECRET?.trim() && env.CURYO_MCP_SESSION_WALLET_BINDINGS?.trim(),
  );
  const walletSessionTtlMs = normalizePositiveInteger(env.CURYO_MCP_SESSION_TTL_MS, DEFAULT_MCP_SESSION_TTL_MS);

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
      walletSessions: {
        enabled: walletSessionAuthEnabled,
        challengeUrl: buildPathUrl(siteBaseUrl, "/api/mcp/session/challenge"),
        tokenUrl: buildPathUrl(siteBaseUrl, "/api/mcp/session/token"),
        defaultScopes: DEFAULT_MCP_SESSION_SCOPES,
        supportedScopes: SUPPORTED_MCP_SESSION_SCOPES,
        ttlSeconds: Math.floor(walletSessionTtlMs / 1000),
        note: walletSessionAuthEnabled
          ? "Sign a one-time wallet challenge, exchange it for a short-lived bearer session, then send that bearer token to the hosted MCP endpoint."
          : "Wallet-bound MCP session issuance is not configured on this deployment yet.",
      },
    },
    capabilities: {
      readTools: READ_TOOLS,
      writeTools: WRITE_TOOLS,
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

function normalizePositiveInteger(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
