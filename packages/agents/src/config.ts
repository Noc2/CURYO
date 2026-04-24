import "dotenv/config";

export type AgentsRuntimeConfig = {
  apiBaseUrl?: string;
  mcpAccessToken?: string;
  mcpApiUrl?: string;
  mcpProtocolVersion?: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readOptionalUrl(name: string): string | undefined {
  const value = readEnv(name);
  if (!value) return undefined;

  try {
    return new URL(value).toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

export function loadAgentsRuntimeConfig(): AgentsRuntimeConfig {
  return {
    apiBaseUrl: readOptionalUrl("CURYO_API_BASE_URL"),
    mcpAccessToken: readEnv("CURYO_MCP_TOKEN"),
    mcpApiUrl: readOptionalUrl("CURYO_MCP_API_URL"),
    mcpProtocolVersion: readEnv("CURYO_MCP_PROTOCOL_VERSION"),
  };
}
