import { createHash } from "node:crypto";

export interface ServerConfig {
  ponderBaseUrl: string;
  ponderTimeoutMs: number;
  serverName: string;
  serverVersion: string;
  transport: ServerTransport;
  httpHost: string;
  httpPort: number;
  httpPath: string;
  httpCorsOrigin: string;
  httpAuth: HttpAuthConfig;
}

export interface HttpAuthConfig {
  mode: HttpAuthMode;
  realm: string;
  tokenHashes: string[];
  scopes: string[];
}

const DEFAULT_PONDER_URL = "http://127.0.0.1:42069";
const DEFAULT_PONDER_TIMEOUT_MS = 10_000;
const DEFAULT_HTTP_HOST = "127.0.0.1";
const DEFAULT_HTTP_PORT = 3334;
const DEFAULT_HTTP_PATH = "/mcp";
const DEFAULT_HTTP_CORS_ORIGIN = "http://localhost:3000";
const DEFAULT_HTTP_AUTH_REALM = "curyo-mcp";
const DEFAULT_HTTP_AUTH_SCOPES = ["mcp:read"] as const;

const SERVER_TRANSPORT_VALUES = ["stdio", "streamable-http"] as const;
export type ServerTransport = (typeof SERVER_TRANSPORT_VALUES)[number];
const HTTP_AUTH_MODE_VALUES = ["none", "bearer"] as const;
export type HttpAuthMode = (typeof HTTP_AUTH_MODE_VALUES)[number];

export function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Ponder URL must use http or https");
  }

  const trimmedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${trimmedPath}`;
}

export function normalizeHttpPath(value: string): string {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash === "/" ? withLeadingSlash : withLeadingSlash.replace(/\/+$/, "");
}

function parseIntegerEnv(value: string | undefined, fallback: number, label: string, minimum: number): number {
  if (value === undefined) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer greater than or equal to ${minimum}`);
  }

  return parsed;
}

function parseTransportEnv(value: string | undefined): ServerTransport {
  const normalized = value ?? "stdio";
  if ((SERVER_TRANSPORT_VALUES as readonly string[]).includes(normalized)) {
    return normalized as ServerTransport;
  }

  throw new Error(`CURYO_MCP_TRANSPORT must be one of: ${SERVER_TRANSPORT_VALUES.join(", ")}`);
}

function parseHttpAuthMode(value: string | undefined): HttpAuthMode {
  const normalized = value ?? "none";
  if ((HTTP_AUTH_MODE_VALUES as readonly string[]).includes(normalized)) {
    return normalized as HttpAuthMode;
  }

  throw new Error(`CURYO_MCP_HTTP_AUTH_MODE must be one of: ${HTTP_AUTH_MODE_VALUES.join(", ")}`);
}

function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function loadHttpAuthConfig(env: NodeJS.ProcessEnv): HttpAuthConfig {
  const mode = parseHttpAuthMode(env.CURYO_MCP_HTTP_AUTH_MODE);
  const realm = env.CURYO_MCP_HTTP_AUTH_REALM ?? DEFAULT_HTTP_AUTH_REALM;
  const tokenValues = [
    ...parseCsvEnv(env.CURYO_MCP_HTTP_BEARER_TOKENS),
    ...(env.CURYO_MCP_HTTP_BEARER_TOKEN ? [env.CURYO_MCP_HTTP_BEARER_TOKEN.trim()] : []),
  ].filter((token) => token.length > 0);

  if (mode === "bearer" && tokenValues.length === 0) {
    throw new Error("CURYO_MCP_HTTP_BEARER_TOKEN or CURYO_MCP_HTTP_BEARER_TOKENS is required when CURYO_MCP_HTTP_AUTH_MODE=bearer");
  }

  const scopes = parseCsvEnv(env.CURYO_MCP_HTTP_AUTH_SCOPES);

  return {
    mode,
    realm,
    tokenHashes: tokenValues.map(hashToken),
    scopes: scopes.length > 0 ? scopes : [...DEFAULT_HTTP_AUTH_SCOPES],
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const ponderBaseUrl = normalizeBaseUrl(env.CURYO_PONDER_URL ?? env.PONDER_URL ?? DEFAULT_PONDER_URL);
  const transport = parseTransportEnv(env.CURYO_MCP_TRANSPORT);

  return {
    ponderBaseUrl,
    ponderTimeoutMs: parseIntegerEnv(env.CURYO_MCP_PONDER_TIMEOUT_MS, DEFAULT_PONDER_TIMEOUT_MS, "CURYO_MCP_PONDER_TIMEOUT_MS", 1),
    serverName: env.CURYO_MCP_SERVER_NAME ?? "curyo-readonly",
    serverVersion: env.CURYO_MCP_SERVER_VERSION ?? env.npm_package_version ?? "0.0.1",
    transport,
    httpHost: env.CURYO_MCP_HTTP_HOST ?? DEFAULT_HTTP_HOST,
    httpPort: parseIntegerEnv(env.CURYO_MCP_HTTP_PORT, DEFAULT_HTTP_PORT, "CURYO_MCP_HTTP_PORT", 0),
    httpPath: normalizeHttpPath(env.CURYO_MCP_HTTP_PATH ?? DEFAULT_HTTP_PATH),
    httpCorsOrigin: env.CURYO_MCP_HTTP_CORS_ORIGIN ?? DEFAULT_HTTP_CORS_ORIGIN,
    httpAuth: loadHttpAuthConfig(env),
  };
}
