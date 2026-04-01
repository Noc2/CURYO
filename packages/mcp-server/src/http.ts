import { createServer as createNodeServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import type { Socket } from "node:net";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateRequest, HttpAuthError } from "./auth.js";
import { PonderClient, type PonderApiError } from "./clients/ponder.js";
import type { HttpServerConfig, ServerConfig } from "./config.js";
import { enforceHttpRateLimit, HttpRateLimitError, HttpRateLimitStoreError } from "./lib/http-rate-limit.js";
import { logEvent, serializeError } from "./lib/logging.js";
import { extractRequestOrigin, isOriginAllowed, normalizeOrigin } from "./lib/origin.js";
import { getMetricsText, recordHttpAuthFailure, recordHttpRateLimit, recordHttpRequest, recordReadinessCheck } from "./metrics.js";
import { buildProtectedResourceMetadata, getProtectedResourceMetadataPath, resolveProtectedResourceMetadataUrl } from "./protected-resource-metadata.js";
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
const METRICS_PATH = "/metrics";
type AuthenticatedIncomingMessage = IncomingMessage & { auth?: AuthInfo };

class HttpRequestBodyError extends Error {
  readonly statusCode: number;
  readonly responseBody: Record<string, unknown>;

  constructor(message: string, statusCode: number, responseBody: Record<string, unknown>) {
    super(message);
    this.name = "HttpRequestBodyError";
    this.statusCode = statusCode;
    this.responseBody = responseBody;
  }
}

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
  configureNodeHttpServer(server, config.httpServer);

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

export function configureNodeHttpServer(server: HttpServer, config: HttpServerConfig): void {
  server.requestTimeout = config.requestTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.maxHeadersCount = config.maxHeadersCount;
  server.setTimeout(config.socketTimeoutMs, (socket: Socket) => {
    socket.destroy();
  });
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
    recordHttpRequest(statusCode);
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
      await ponderClient.getStats();
      recordReadinessCheck(true);
      sendJson(
        response,
        200,
        {
          status: "ready",
          checks: {
            ponder: "ok",
          },
          generatedAt: new Date().toISOString(),
        },
        config,
      );
      logResponse(200, { route: "readyz" });
    } catch (error) {
      recordReadinessCheck(false);
      const statusCode = isPonderApiError(error) ? 503 : 500;
      sendJson(
        response,
        statusCode,
        {
          status: "degraded",
          checks: {
            ponder: "failed",
          },
          generatedAt: new Date().toISOString(),
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

  if (requestUrl.pathname === METRICS_PATH) {
    let authInfo: AuthInfo | undefined;
    try {
      authInfo = authenticateRequest(request, config.httpAuth, {
        requiredScopes: ["metrics:read"],
      });
    } catch (error) {
      if (error instanceof HttpAuthError) {
        recordHttpAuthFailure();
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
          route: "metrics",
          ...serializeError(error),
        });
        return;
      }

      throw error;
    }

    applyCorsHeaders(response, config);
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
    response.end(getMetricsText());
    logResponse(200, { route: "metrics", authClientId: authInfo?.clientId });
    return;
  }

  const protectedResourceMetadataPath = getProtectedResourceMetadataPath(config.httpPath);
  if (config.httpAuth.mode !== "none" && requestUrl.pathname === protectedResourceMetadataPath) {
    if (request.method !== "GET") {
      response.setHeader("Allow", "GET");
      sendJson(response, 405, { error: `Unsupported method: ${request.method ?? "UNKNOWN"}` }, config);
      logResponse(405, { route: "oauth-protected-resource" });
      return;
    }

    sendJson(response, 200, buildProtectedResourceMetadata(request, config), config);
    logResponse(200, { route: "oauth-protected-resource" });
    return;
  }

  if (requestUrl.pathname !== config.httpPath) {
    sendJson(response, 404, { error: `MCP endpoint not found: ${requestUrl.pathname}` }, config);
    logResponse(404);
    return;
  }

  const originError = validateMcpRequestOrigin(request, config);
  if (originError) {
    sendJson(response, 403, { error: originError.message }, config);
    logEvent("warn", "mcp_http_origin_rejected", {
      method,
      path: requestUrl.pathname,
      statusCode: 403,
      durationMs: Date.now() - startedAt,
      remoteAddress,
      requestOrigin: originError.requestOrigin,
      allowedOrigins: config.httpAllowedOrigins,
    });
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
    authInfo = authenticateRequest(request, config.httpAuth, {
      requiredScopes: ["mcp:read"],
      resourceMetadataUrl: resolveProtectedResourceMetadataUrl(request, config),
    });
  } catch (error) {
    if (error instanceof HttpAuthError) {
      recordHttpAuthFailure();
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

  try {
    await enforceHttpRateLimit(request, config.httpRateLimit, authInfo, requestUrl.pathname);
  } catch (error) {
    if (error instanceof HttpRateLimitError) {
      recordHttpRateLimit();
      response.setHeader("Retry-After", String(error.retryAfterSeconds));
      sendJson(
        response,
        error.statusCode,
        {
          error: error.message,
          policy: error.policy,
          limit: error.limit,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        config,
      );
      logEvent("warn", "mcp_http_rate_limited", {
        method,
        path: requestUrl.pathname,
        statusCode: error.statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress,
        authClientId: authInfo?.clientId,
        policy: error.policy,
        limit: error.limit,
        retryAfterSeconds: error.retryAfterSeconds,
      });
      return;
    }

    if (error instanceof HttpRateLimitStoreError) {
      sendJson(response, error.statusCode, { error: error.message }, config);
      logEvent("error", "mcp_http_rate_limit_backend_failed", {
        method,
        path: requestUrl.pathname,
        statusCode: error.statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress,
        authClientId: authInfo?.clientId,
        ...serializeError(error),
      });
      return;
    }

    throw error;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readParsedJsonBody(request, config.httpServer.maxRequestBodyBytes);
  } catch (error) {
    if (error instanceof HttpRequestBodyError) {
      sendJson(response, error.statusCode, error.responseBody, config);
      logEvent("warn", "mcp_http_body_rejected", {
        method,
        path: requestUrl.pathname,
        statusCode: error.statusCode,
        durationMs: Date.now() - startedAt,
        remoteAddress,
        authClientId: authInfo?.clientId,
        limitBytes: config.httpServer.maxRequestBodyBytes,
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
    await transport.handleRequest(requestWithAuth, response, parsedBody);
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

async function readParsedJsonBody(request: IncomingMessage, maxRequestBodyBytes: number): Promise<unknown> {
  if (request.method !== "POST") {
    return undefined;
  }

  const contentTypeHeader = Array.isArray(request.headers["content-type"])
    ? request.headers["content-type"][0]
    : request.headers["content-type"];
  if (!contentTypeHeader?.includes("application/json")) {
    return undefined;
  }

  const contentLength = parseContentLength(request.headers["content-length"]);
  if (contentLength !== null && contentLength > maxRequestBodyBytes) {
    request.resume();
    throw new HttpRequestBodyError("Request body exceeds configured limit", 413, {
      error: "Request body exceeds configured limit",
      limitBytes: maxRequestBodyBytes,
    });
  }

  return await new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;

    const cleanup = () => {
      request.off("aborted", handleAborted);
      request.off("data", handleData);
      request.off("end", handleEnd);
      request.off("error", handleError);
    };

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      fn();
    };

    const handleAborted = () => {
      finish(() =>
        reject(
          new HttpRequestBodyError("Request body was aborted", 400, {
            error: "Request body was aborted",
          }),
        ),
      );
    };

    const handleData = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > maxRequestBodyBytes) {
        request.resume();
        finish(() =>
          reject(
            new HttpRequestBodyError("Request body exceeds configured limit", 413, {
              error: "Request body exceeds configured limit",
              limitBytes: maxRequestBodyBytes,
            }),
          ),
        );
        return;
      }

      chunks.push(buffer);
    };

    const handleEnd = () => {
      finish(() => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(
            new HttpRequestBodyError("Parse error: Invalid JSON", 400, {
              jsonrpc: "2.0",
              error: {
                code: -32700,
                message: "Parse error: Invalid JSON",
              },
              id: null,
            }),
          );
        }
      });
    };

    const handleError = (error: Error) => {
      finish(() => reject(error));
    };

    request.on("aborted", handleAborted);
    request.on("data", handleData);
    request.on("end", handleEnd);
    request.on("error", handleError);
  });
}

function parseContentLength(header: string | string[] | undefined): number | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isPonderApiError(error: unknown): error is PonderApiError {
  return error instanceof Error && error.name === "PonderApiError";
}

function validateMcpRequestOrigin(
  request: IncomingMessage,
  config: ServerConfig,
): { message: string; requestOrigin: string } | null {
  const requestOrigin = extractRequestOrigin(request);
  if (!requestOrigin) {
    return null;
  }

  if (requestOrigin.toLowerCase() === "null") {
    return {
      message: "Invalid Origin header",
      requestOrigin,
    };
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = normalizeOrigin(requestOrigin, "Origin header");
  } catch {
    return {
      message: "Invalid Origin header",
      requestOrigin,
    };
  }

  if (config.httpAllowedOrigins.length > 0 && isOriginAllowed(normalizedOrigin, config.httpAllowedOrigins)) {
    return null;
  }

  return {
    message: "Origin is not allowed for this MCP endpoint",
    requestOrigin: normalizedOrigin,
  };
}
