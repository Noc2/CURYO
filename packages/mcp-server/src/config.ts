export interface ServerConfig {
  ponderBaseUrl: string;
  serverName: string;
  serverVersion: string;
}

const DEFAULT_PONDER_URL = "http://127.0.0.1:42069";

export function normalizeBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Ponder URL must use http or https");
  }

  const trimmedPath = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${trimmedPath}`;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const ponderBaseUrl = normalizeBaseUrl(env.CURYO_PONDER_URL ?? env.PONDER_URL ?? DEFAULT_PONDER_URL);

  return {
    ponderBaseUrl,
    serverName: env.CURYO_MCP_SERVER_NAME ?? "curyo-readonly",
    serverVersion: env.CURYO_MCP_SERVER_VERSION ?? env.npm_package_version ?? "0.0.1",
  };
}
