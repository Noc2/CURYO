import type { IncomingMessage } from "node:http";
import type { ServerConfig } from "./config.js";

const OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH = "/.well-known/oauth-protected-resource";
const MCP_PROTECTED_RESOURCE_SCOPES = [
  "mcp:read",
  "mcp:write",
  "mcp:write:vote",
  "mcp:write:submit_content",
  "mcp:write:claim_reward",
  "mcp:write:claim_frontend_fee",
] as const;

export function getProtectedResourceMetadataPath(httpPath: string): string {
  return httpPath === "/" ? OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH : `${OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PATH}${httpPath}`;
}

export function resolveProtectedResourceMetadataUrl(request: IncomingMessage, config: ServerConfig): string {
  return buildAbsoluteUrl(request, config, getProtectedResourceMetadataPath(config.httpPath));
}

export function resolveProtectedResourceUrl(request: IncomingMessage, config: ServerConfig): string {
  return buildAbsoluteUrl(request, config, config.httpPath);
}

export function buildProtectedResourceMetadata(
  request: IncomingMessage,
  config: ServerConfig,
): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    resource: resolveProtectedResourceUrl(request, config),
    bearer_methods_supported: ["header"],
    scopes_supported: getProtectedResourceScopes(config),
    resource_name: config.serverName,
  };

  if (config.httpAuthorizationServers.length > 0) {
    metadata.authorization_servers = config.httpAuthorizationServers;
  }

  if (config.httpResourceDocumentationUrl) {
    metadata.resource_documentation = config.httpResourceDocumentationUrl;
  }

  return metadata;
}

function getProtectedResourceScopes(config: ServerConfig): string[] {
  const scopes = new Set<string>(["mcp:read"]);

  if (config.write.enabled) {
    for (const scope of MCP_PROTECTED_RESOURCE_SCOPES.slice(1)) {
      scopes.add(scope);
    }
  }

  return [...scopes];
}

function buildAbsoluteUrl(request: IncomingMessage, config: ServerConfig, path: string): string {
  const baseUrl = config.httpPublicBaseUrl ?? resolveRequestBaseUrl(request);
  return new URL(path.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

function resolveRequestBaseUrl(request: IncomingMessage): string {
  const forwardedProtoHeader = request.headers["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader;
  const protocol = forwardedProto?.split(",", 1)[0]?.trim() || "http";
  const host = Array.isArray(request.headers.host) ? request.headers.host[0] : request.headers.host;
  if (!host?.trim()) {
    throw new Error("Cannot resolve a public MCP base URL without an HTTP Host header");
  }

  return `${protocol}://${host.trim()}`;
}
