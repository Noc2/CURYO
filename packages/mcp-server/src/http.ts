import { createServer as createNodeServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateRequest, HttpAuthError } from "./auth.js";
import { PonderClient, type PonderApiError } from "./clients/ponder.js";
import type { ServerConfig } from "./config.js";
import { logEvent, serializeError } from "./lib/logging.js";
import { createServer as createMcpServer } from "./server.js";

export interface RunningHttpServer {
  endpointUrl: string | null;
  healthUrl: string | null;
  readinessUrl: string | null;
  listenAddress: string;
  listenPort: number;
  server: HttpServer;
  close: () => Promise<void>;
}

const CORS_ALLOW_METHODS = "GET, POST, DELETE, OPTIONS";
const CORS_ALLOW_HEADERS = "Accept, Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, Mcp-Session-Id";
const HEALTH_PATH = "/healthz";
const READINESS_PATH = "/readyz";
type AuthenticatedIncomingMessage = IncomingMessage & { auth?: AuthInfo };

function isWildcardAddress(address: string): boolean {
  return address === "0.0.0.0" || address === "::";
}

function buildPublicUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/, ""), `${baseUrl.replace(/\/+$/, "")}/`).toString();
}

export function resolveAdvertisedHttpUrl(params: {
  listenAddress: string;
  listenPort: number;
  path: string;
  publicBaseUrl: string | null;
}): string | null {
  if (params.publicBaseUrl) {
    return buildPublicUrl(params.publicBaseUrl, params.path);
  }

  if (isWildcardAddress(params.listenAddress)) {
    return null;
  }

  return new URL(params.path, `http://${params.listenAddress}:${params.listenPort}`).toString();
}

export async function startStreamableHttpServer(config: ServerConfig): Promise<RunningHttpServer> {
  const ponderClient = new PonderClient({
    baseUrl: config.ponderBaseUrl,
    timeoutMs: config.ponderTimeoutMs,
  });
  const server = createNodeServer((request, response) => {
    void handleStreamableHttpRequest(request, response, config, ponderClient);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.httpPort, config.httpHost, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve MCP HTTP server address");
  }

  const endpointUrl = resolveAdvertisedHttpUrl({
    listenAddress: address.address,
    listenPort: address.port,
    path: config.httpPath,
    publicBaseUrl: config.httpPublicBaseUrl,
  });
  const healthUrl = resolveAdvertisedHttpUrl({
    listenAddress: address.address,
    listenPort: address.port,
    path: HEALTH_PATH,
    publicBaseUrl: config.httpPublicBaseUrl,
  });
  const readinessUrl = resolveAdvertisedHttpUrl({
    listenAddress: address.address,
    listenPort: address.port,
    path: READINESS_PATH,
    publicBaseUrl: config.httpPublicBaseUrl,
  });

  return {
    endpointUrl,
    healthUrl,
    readinessUrl,
    listenAddress: address.address,
    listenPort: address.port,
    server,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

function applyCorsHeaders(response: ServerResponse, config: ServerConfig): void {
  response.setHeader("Access-Control-Allow-Origin", config.httpCorsOrigin);
  response.setHeader("Access-Control-Allow-Methods", CORS_ALLOW_METHODS);
  response.setHeader("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
}

function sendJson(response: ServerResponse, statusCode: number, body: Record<string, unknown>, config: ServerConfig): void {
  applyCorsHeaders(response, config);
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

export async function handleStreamableHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  config: ServerConfig,
  ponderClient = new PonderClient({
    baseUrl: config.ponderBaseUrl,
    timeoutMs: config.ponderTimeoutMs,
  }),
): Promise<void> {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? `${config.httpHost}:${config.httpPort}`}`);
  const startedAt = Date.now();
  const method = request.method ?? "UNKNOWN";
  const remoteAddress = request.socket?.remoteAddress ?? null;

  const logResponse = (statusCode: number, extra: Record<string, unknown> = {}) => {
    logEvent("info", "mcp_http_request", {
      method,
      path: requestUrl.pathname,
      statusCode,
      durationMs: Date.now() - startedAt,
      remoteAddress,
      ...extra,
    });
  };

  if (requestUrl.pathname === HEALTH_PATH) {
    sendJson(
      response,
      200,
      {
        status: "ok",
        transport: "streamable-http",
        serverName: config.serverName,
        serverVersion: config.serverVersion,
        mcpPath: config.httpPath,
        generatedAt: new Date().toISOString(),
      },
      config,
    );
    logResponse(200, { route: "healthz" });
    return;
  }

  if (requestUrl.pathname === READINESS_PATH) {
    try {
      const stats = await ponderClient.getStats();
      sendJson(
        response,
        200,
        {
          status: "ready",
          upstream: {
            source: "ponder",
            baseUrl: config.ponderBaseUrl,
          },
          checks: {
            ponder: "ok",
          },
          sample: stats,
          generatedAt: new Date().toISOString(),
        },
        config,
      );
      logResponse(200, { route: "readyz" });
    } catch (error) {
      const statusCode = isPonderApiError(error) ? 503 : 500;
      sendJson(
        response,
        statusCode,
        {
          status: "degraded",
          upstream: {
            source: "ponder",
            baseUrl: config.ponderBaseUrl,
          },
          checks: {
            ponder: "failed",
          },
          ...serializeError(error),
        },
        config,
      );
      logEvent("warn", "mcp_http_readiness_failed", {
        path: requestUrl.pathname,
        statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress,
        ...serializeError(error),
      });
    }
    return;
  }

  if (requestUrl.pathname !== config.httpPath) {
    sendJson(response, 404, { error: `MCP endpoint not found: ${requestUrl.pathname}` }, config);
    logResponse(404);
    return;
  }

  if (request.method === "OPTIONS") {
    applyCorsHeaders(response, config);
    response.statusCode = 204;
    response.end();
    logResponse(204);
    return;
  }

  if (request.method !== "GET" && request.method !== "POST" && request.method !== "DELETE") {
    response.setHeader("Allow", CORS_ALLOW_METHODS);
    sendJson(response, 405, { error: `Unsupported method: ${request.method ?? "UNKNOWN"}` }, config);
    logResponse(405);
    return;
  }

  let authInfo: AuthInfo | undefined;
  try {
    authInfo = authenticateRequest(request, config.httpAuth);
  } catch (error) {
    if (error instanceof HttpAuthError) {
      response.setHeader("WWW-Authenticate", error.wwwAuthenticate);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, error.statusCode, { error: error.message }, config);
      logEvent("warn", "mcp_http_auth_failed", {
        method,
        path: requestUrl.pathname,
        statusCode: error.statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress,
        authMode: config.httpAuth.mode,
        ...serializeError(error),
      });
      return;
    }

    throw error;
  }

  const mcpServer = createMcpServer(config);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  const cleanup = async () => {
    await Promise.allSettled([transport.close(), mcpServer.close()]);
  };

  response.once("close", () => {
    void cleanup();
  });

  try {
    applyCorsHeaders(response, config);
    await mcpServer.connect(transport);
    const requestWithAuth = request as AuthenticatedIncomingMessage;
    requestWithAuth.auth = authInfo;
    await transport.handleRequest(requestWithAuth, response);
    logResponse(response.statusCode || 200, authInfo ? { authClientId: authInfo.clientId } : {});
  } catch (error) {
    await cleanup();

    if (response.headersSent) {
      logEvent("error", "mcp_http_request_failed_after_headers", {
        method,
        path: requestUrl.pathname,
        durationMs: Date.now() - startedAt,
        remoteAddress,
        authClientId: authInfo?.clientId,
        ...serializeError(error),
      });
      response.destroy(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const message = error instanceof Error ? error.message : "Unexpected MCP HTTP server error";
    sendJson(response, 500, { error: message }, config);
    logEvent("error", "mcp_http_request_failed", {
      method,
      path: requestUrl.pathname,
      statusCode: 500,
      durationMs: Date.now() - startedAt,
      remoteAddress,
      authClientId: authInfo?.clientId,
      ...serializeError(error),
    });
  }
}

function isPonderApiError(error: unknown): error is PonderApiError {
  return error instanceof Error && error.name === "PonderApiError";
}
