import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PonderClient } from "../clients/ponder.js";
import type { ServerConfig } from "../config.js";
import { __resetHttpRateLimitStateForTests, __setHttpRateLimitStoreFactoryForTests } from "../lib/http-rate-limit.js";
import { configureNodeHttpServer, handleStreamableHttpRequest, resolveAdvertisedHttpUrl } from "../http.js";
import { __resetMcpMetricsForTests } from "../metrics.js";

interface MockResponse {
  headers: Record<string, string>;
  headersSent: boolean;
  statusCode: number;
  body: string;
  destroyError?: Error;
  setHeader(name: string, value: string): void;
  writeHead(statusCode: number, headers?: Record<string, string>): void;
  end(body?: string): void;
  once(_event: string, _handler: () => void): void;
  destroy(error?: Error): void;
}

function createMockResponse(): ServerResponse<IncomingMessage> & MockResponse {
  const response: MockResponse = {
    headers: {},
    headersSent: false,
    statusCode: 200,
    body: "",
    destroyError: undefined,
    setHeader(name: string, value: string) {
      response.headers[name] = value;
    },
    writeHead(statusCode: number, headers?: Record<string, string>) {
      response.statusCode = statusCode;
      for (const [name, value] of Object.entries(headers ?? {})) {
        response.headers[name] = value;
      }
      return response as unknown as ServerResponse<IncomingMessage> & MockResponse;
    },
    end(body?: string) {
      if (body) {
        response.body = body;
      }
      response.headersSent = true;
    },
    once() {
      return response;
    },
    destroy(error?: Error) {
      response.destroyError = error;
    },
  };

  return response as unknown as ServerResponse<IncomingMessage> & MockResponse;
}

describe("handleStreamableHttpRequest", () => {
  const config: ServerConfig = {
    ponderBaseUrl: "https://ponder.curyo.xyz",
    ponderTimeoutMs: 10_000,
    serverName: "curyo-test",
    serverVersion: "0.0.1",
    transport: "streamable-http" as const,
    httpHost: "127.0.0.1",
    httpPort: 3334,
    httpPath: "/mcp",
    httpPublicBaseUrl: null,
    httpCorsOrigin: "*",
    httpAllowedOrigins: [],
    httpAuthorizationServers: [],
    httpResourceDocumentationUrl: null,
    httpServer: {
      requestTimeoutMs: 30_000,
      headersTimeoutMs: 60_000,
      keepAliveTimeoutMs: 5_000,
      socketTimeoutMs: 60_000,
      maxHeadersCount: 100,
      maxRequestBodyBytes: 1_048_576,
    },
    httpAuth: {
      mode: "none" as const,
      realm: "curyo-mcp",
      tokenHashes: [],
      scopes: ["mcp:read"],
      tokens: [],
      sessionKeys: [],
    },
    httpRateLimit: {
      enabled: true,
      windowMs: 60_000,
      readRequestsPerWindow: 120,
      writeRequestsPerWindow: 20,
      trustedProxyHeaders: [],
      store: "memory" as const,
      redisUrl: null,
      redisKeyPrefix: "curyo:mcp:ratelimit",
      redisConnectTimeoutMs: 2_000,
    },
    write: {
      enabled: false,
      rpcUrl: null,
      chainId: null,
      chainName: null,
      maxGasPerTx: 2_000_000,
      defaultIdentityId: null,
      identities: [],
      contracts: null,
      policy: {
        maxVoteStake: null,
        allowedSubmissionHosts: [],
        submissionRevealPollIntervalMs: 500,
        submissionRevealTimeoutMs: 30000,
      },
    },
  };

  beforeEach(() => {
    __resetHttpRateLimitStateForTests();
    __setHttpRateLimitStoreFactoryForTests(null);
    __resetMcpMetricsForTests();
  });

  function createStreamingRequest(
    body: string,
    options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      remoteAddress?: string;
    },
  ): IncomingMessage {
    const request = Readable.from([body]) as IncomingMessage;
    request.url = options.url;
    request.method = options.method;
    request.headers = options.headers;
    Object.defineProperty(request, "socket", {
      value: {
        remoteAddress: options.remoteAddress ?? "127.0.0.1",
      },
      configurable: true,
    });
    return request;
  }

  it("returns 404 for unknown paths", async () => {
    const request = {
      url: "/wrong",
      method: "GET",
      headers: {
        host: "127.0.0.1:3334",
      },
    } as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, config);

    expect(response.statusCode).toBe(404);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(JSON.parse(response.body)).toEqual({
      error: "MCP endpoint not found: /wrong",
    });
  });

  it("returns CORS preflight headers for OPTIONS requests", async () => {
    const request = {
      url: "/mcp",
      method: "OPTIONS",
      headers: {
        host: "127.0.0.1:3334",
      },
    } as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, config);

    expect(response.statusCode).toBe(204);
    expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(response.headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(response.body).toBe("");
  });

  it("allows MCP requests without an Origin header", async () => {
    const request = {
      url: "/mcp",
      method: "OPTIONS",
      headers: {
        host: "127.0.0.1:3334",
      },
    } as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAllowedOrigins: ["https://curyo.xyz"],
    });

    expect(response.statusCode).toBe(204);
  });

  it("rejects MCP requests with an invalid Origin header", async () => {
    const request = {
      url: "/mcp",
      method: "OPTIONS",
      headers: {
        host: "127.0.0.1:3334",
        origin: "null",
      },
    } as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAllowedOrigins: ["https://curyo.xyz"],
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: "Invalid Origin header",
    });
  });

  it("rejects MCP requests from origins outside the allowlist", async () => {
    const request = {
      url: "/mcp",
      method: "OPTIONS",
      headers: {
        host: "127.0.0.1:3334",
        origin: "https://evil.example",
      },
    } as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAllowedOrigins: ["https://curyo.xyz"],
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: "Origin is not allowed for this MCP endpoint",
    });
  });

  it("accepts MCP requests from configured allowed origins", async () => {
    const request = {
      url: "/mcp",
      method: "OPTIONS",
      headers: {
        host: "127.0.0.1:3334",
        origin: "https://curyo.xyz",
      },
    } as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAllowedOrigins: ["https://curyo.xyz"],
    });

    expect(response.statusCode).toBe(204);
  });

  it("returns process health on /healthz", async () => {
    const request = {
      url: "/healthz",
      method: "GET",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, config);

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "ok",
      transport: "streamable-http",
      mcpPath: "/mcp",
    });
  });

  it("serves OAuth protected resource metadata for the MCP endpoint", async () => {
    const request = {
      url: "/.well-known/oauth-protected-resource/mcp",
      method: "GET",
      headers: {
        host: "mcp.curyo.xyz",
        "x-forwarded-proto": "https",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAuth: {
        ...config.httpAuth,
        mode: "bearer",
      },
      httpAuthorizationServers: ["https://auth.curyo.xyz"],
      httpResourceDocumentationUrl: "https://curyo.xyz/docs/ai",
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      resource: "https://mcp.curyo.xyz/mcp",
      authorization_servers: ["https://auth.curyo.xyz"],
      bearer_methods_supported: ["header"],
      scopes_supported: ["mcp:read"],
      resource_name: "curyo-test",
      resource_documentation: "https://curyo.xyz/docs/ai",
    });
  });

  it("returns readiness based on Ponder availability on /readyz", async () => {
    const request = {
      url: "/readyz",
      method: "GET",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();
    const ponderClient = {
      getStats: async () => ({
        stats: {
          totalContent: "10",
        },
      }),
    } as unknown as PonderClient;

    await handleStreamableHttpRequest(request, response, config, ponderClient);

    expect(response.statusCode).toBe(200);
    const payload = JSON.parse(response.body);
    expect(payload).toMatchObject({
      status: "ready",
      checks: {
        ponder: "ok",
      },
    });
    expect(payload).not.toHaveProperty("sample");
    expect(payload).not.toHaveProperty("upstream");
  });

  it("keeps readiness failures coarse-grained", async () => {
    const request = {
      url: "/readyz",
      method: "GET",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();
    const ponderClient = {
      getStats: async () => {
        throw new Error("ponder connection refused");
      },
    } as unknown as PonderClient;

    await handleStreamableHttpRequest(request, response, config, ponderClient);

    expect(response.statusCode).toBe(500);
    const payload = JSON.parse(response.body);
    expect(payload).toEqual(
      expect.objectContaining({
        status: "degraded",
        checks: {
          ponder: "failed",
        },
      }),
    );
    expect(payload).not.toHaveProperty("error");
    expect(payload).not.toHaveProperty("message");
    expect(payload).not.toHaveProperty("stack");
    expect(payload).not.toHaveProperty("upstream");
  });

  it("serves Prometheus-style metrics on /metrics", async () => {
    const request = {
      url: "/metrics",
      method: "GET",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, config);

    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toContain("text/plain");
    expect(response.body).toContain("mcp_http_requests_total");
    expect(response.body).toContain("mcp_write_tool_invocations_total");
  });

  it("requires a metrics scope on /metrics when bearer auth is enabled", async () => {
    const request = {
      url: "/metrics",
      method: "GET",
      headers: {
        host: "127.0.0.1:3334",
        authorization: "Bearer secret-token",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAuth: {
        mode: "bearer",
        realm: "curyo-mcp",
        tokenHashes: ["930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94"],
        scopes: ["mcp:read"],
        tokens: [
          {
            tokenHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
            clientId: "reader",
            scopes: ["mcp:read"],
            identityId: null,
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static",
          },
        ],
        sessionKeys: [],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["WWW-Authenticate"]).toContain('error="insufficient_scope"');
    expect(response.headers["WWW-Authenticate"]).toContain('scope="metrics:read"');
    expect(JSON.parse(response.body)).toEqual({
      error: "Bearer token lacks the required scope",
    });
  });

  it("serves /metrics for bearer tokens with metrics:read", async () => {
    const request = {
      url: "/metrics",
      method: "GET",
      headers: {
        host: "127.0.0.1:3334",
        authorization: "Bearer secret-token",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAuth: {
        mode: "bearer",
        realm: "curyo-mcp",
        tokenHashes: ["930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94"],
        scopes: ["metrics:read"],
        tokens: [
          {
            tokenHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
            clientId: "metrics-reader",
            scopes: ["metrics:read"],
            identityId: null,
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static",
          },
        ],
        sessionKeys: [],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toContain("text/plain");
    expect(response.body).toContain("mcp_http_requests_total");
  });

  it("rejects unauthenticated MCP requests when bearer auth is enabled", async () => {
    const request = {
      url: "/mcp",
      method: "POST",
      headers: {
        host: "127.0.0.1:3334",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAuth: {
        mode: "bearer",
        realm: "curyo-mcp",
        tokenHashes: ["8f434346648f6b96df89dda901c5176b10a6d83961fca37f8e1d249d8d68db9d"],
        scopes: ["mcp:read"],
        tokens: [
          {
            tokenHash: "8f434346648f6b96df89dda901c5176b10a6d83961fca37f8e1d249d8d68db9d",
            clientId: "reader",
            scopes: ["mcp:read"],
            identityId: null,
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static",
          },
        ],
        sessionKeys: [],
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["WWW-Authenticate"]).toContain('Bearer realm="curyo-mcp"');
    expect(response.headers["WWW-Authenticate"]).toContain('resource_metadata="http://127.0.0.1:3334/.well-known/oauth-protected-resource/mcp"');
    expect(response.headers["WWW-Authenticate"]).toContain('scope="mcp:read"');
    expect(JSON.parse(response.body)).toEqual({
      error: "Missing bearer token",
    });
  });

  it("rejects MCP requests for bearer tokens without mcp:read", async () => {
    const request = {
      url: "/mcp",
      method: "POST",
      headers: {
        host: "127.0.0.1:3334",
        authorization: "Bearer secret-token",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAuth: {
        mode: "bearer",
        realm: "curyo-mcp",
        tokenHashes: ["930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94"],
        scopes: ["metrics:read"],
        tokens: [
          {
            tokenHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
            clientId: "metrics-reader",
            scopes: ["metrics:read"],
            identityId: null,
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static",
          },
        ],
        sessionKeys: [],
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers["WWW-Authenticate"]).toContain('error="insufficient_scope"');
    expect(response.headers["WWW-Authenticate"]).toContain('scope="mcp:read"');
    expect(response.headers["WWW-Authenticate"]).toContain('resource_metadata="http://127.0.0.1:3334/.well-known/oauth-protected-resource/mcp"');
    expect(JSON.parse(response.body)).toEqual({
      error: "Bearer token lacks the required scope",
    });
  });

  it("returns 429 when the HTTP rate limit is exceeded", async () => {
    __resetHttpRateLimitStateForTests();

    const request = {
      url: "/mcp",
      method: "POST",
      headers: {
        host: "127.0.0.1:3334",
        authorization: "Bearer secret-token",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;

    const rateLimitedConfig: ServerConfig = {
      ...config,
      httpAuth: {
        mode: "bearer" as const,
        realm: "curyo-mcp",
        tokenHashes: ["930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94"],
        scopes: ["mcp:read"],
        tokens: [
          {
            tokenHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
            clientId: "reader",
            scopes: ["mcp:read"],
            identityId: null,
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static" as const,
          },
        ],
        sessionKeys: [],
      },
      httpRateLimit: {
        enabled: true,
        windowMs: 60_000,
        readRequestsPerWindow: 1,
        writeRequestsPerWindow: 1,
        trustedProxyHeaders: [],
        store: "memory" as const,
        redisUrl: null,
        redisKeyPrefix: "curyo:mcp:ratelimit",
        redisConnectTimeoutMs: 2_000,
      },
    };

    const firstResponse = createMockResponse();
    await handleStreamableHttpRequest(request, firstResponse, rateLimitedConfig);

    const secondResponse = createMockResponse();
    await handleStreamableHttpRequest(request, secondResponse, rateLimitedConfig);

    expect(secondResponse.statusCode).toBe(429);
    expect(secondResponse.headers["Retry-After"]).toBeDefined();
    expect(JSON.parse(secondResponse.body)).toMatchObject({
      error: "Too many MCP requests in the current window",
      policy: "read",
      limit: 1,
    });
  });

  it("keys anonymous requests by trusted proxy headers instead of the proxy hop", async () => {
    __resetHttpRateLimitStateForTests();

    const rateLimitedConfig: ServerConfig = {
      ...config,
      httpRateLimit: {
        enabled: true,
        windowMs: 60_000,
        readRequestsPerWindow: 1,
        writeRequestsPerWindow: 1,
        trustedProxyHeaders: ["x-forwarded-for"],
        store: "memory" as const,
        redisUrl: null,
        redisKeyPrefix: "curyo:mcp:ratelimit",
        redisConnectTimeoutMs: 2_000,
      },
    };

    const firstRequest = {
      url: "/mcp",
      method: "POST",
      headers: {
        host: "127.0.0.1:3334",
        "x-forwarded-for": "203.0.113.10",
      },
      socket: {
        remoteAddress: "10.0.0.1",
      },
    } as unknown as IncomingMessage;

    const secondRequest = {
      url: "/mcp",
      method: "POST",
      headers: {
        host: "127.0.0.1:3334",
        "x-forwarded-for": "203.0.113.11",
      },
      socket: {
        remoteAddress: "10.0.0.1",
      },
    } as unknown as IncomingMessage;

    const firstResponse = createMockResponse();
    await handleStreamableHttpRequest(firstRequest, firstResponse, rateLimitedConfig);

    const secondResponse = createMockResponse();
    await handleStreamableHttpRequest(secondRequest, secondResponse, rateLimitedConfig);

    expect(firstResponse.statusCode).not.toBe(429);
    expect(secondResponse.statusCode).not.toBe(429);

    const repeatedResponse = createMockResponse();
    await handleStreamableHttpRequest(firstRequest, repeatedResponse, rateLimitedConfig);

    expect(repeatedResponse.statusCode).toBe(429);
    expect(JSON.parse(repeatedResponse.body)).toMatchObject({
      error: "Too many MCP requests in the current window",
      policy: "read",
      limit: 1,
    });
  });

  it("returns 413 when an MCP JSON request body exceeds the configured limit", async () => {
    const request = createStreamingRequest(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: {
          payload: "x".repeat(256),
        },
      }),
      {
        url: "/mcp",
        method: "POST",
        headers: {
          host: "127.0.0.1:3334",
          accept: "application/json, text/event-stream",
          "content-type": "application/json",
          authorization: "Bearer secret-token",
        },
      },
    );
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpServer: {
        ...config.httpServer,
        maxRequestBodyBytes: 64,
      },
      httpAuth: {
        mode: "bearer",
        realm: "curyo-mcp",
        tokenHashes: ["930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94"],
        scopes: ["mcp:read"],
        tokens: [
          {
            tokenHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
            clientId: "reader",
            scopes: ["mcp:read"],
            identityId: null,
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static",
          },
        ],
        sessionKeys: [],
      },
    });

    expect(response.statusCode).toBe(413);
    expect(JSON.parse(response.body)).toEqual({
      error: "Request body exceeds configured limit",
      limitBytes: 64,
    });
  });

  it("returns 503 when the shared rate-limit backend is unavailable", async () => {
    __setHttpRateLimitStoreFactoryForTests(() => ({
      increment: async () => {
        throw new Error("redis unavailable");
      },
    }));

    const request = {
      url: "/mcp",
      method: "POST",
      headers: {
        host: "127.0.0.1:3334",
        authorization: "Bearer secret-token",
      },
      socket: {
        remoteAddress: "127.0.0.1",
      },
    } as unknown as IncomingMessage;
    const response = createMockResponse();

    await handleStreamableHttpRequest(request, response, {
      ...config,
      httpAuth: {
        mode: "bearer" as const,
        realm: "curyo-mcp",
        tokenHashes: ["930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94"],
        scopes: ["mcp:read"],
        tokens: [
          {
            tokenHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
            clientId: "reader",
            scopes: ["mcp:read"],
            identityId: null,
            notBefore: null,
            expiresAt: null,
            subject: null,
            kind: "static" as const,
          },
        ],
        sessionKeys: [],
      },
      httpRateLimit: {
        ...config.httpRateLimit,
        store: "redis" as const,
        redisUrl: "redis://127.0.0.1:6379",
      },
    });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({
      error: "Rate limit backend unavailable: redis unavailable",
    });
  });
});

describe("resolveAdvertisedHttpUrl", () => {
  it("omits a connect URL for wildcard bind addresses without a public base URL", () => {
    expect(
      resolveAdvertisedHttpUrl({
        listenAddress: "0.0.0.0",
        listenPort: 3334,
        path: "/mcp",
        publicBaseUrl: null,
      }),
    ).toBe(null);
  });

  it("uses the configured public base URL when provided", () => {
    expect(
      resolveAdvertisedHttpUrl({
        listenAddress: "0.0.0.0",
        listenPort: 3334,
        path: "/mcp",
        publicBaseUrl: "https://mcp.curyo.xyz/base",
      }),
    ).toBe("https://mcp.curyo.xyz/base/mcp");
  });
});

describe("configureNodeHttpServer", () => {
  it("applies explicit timeout and header limits to the Node server", () => {
    const destroy = vi.fn();
    let timeoutMs = 0;
    let timeoutHandler: ((socket: { destroy: () => void }) => void) | undefined;
    const server = {
      requestTimeout: 0,
      headersTimeout: 0,
      keepAliveTimeout: 0,
      maxHeadersCount: 0,
      setTimeout: vi.fn((value: number, handler: (socket: { destroy: () => void }) => void) => {
        timeoutMs = value;
        timeoutHandler = handler;
      }),
    } as unknown as Parameters<typeof configureNodeHttpServer>[0];

    configureNodeHttpServer(server, {
      requestTimeoutMs: 15_000,
      headersTimeoutMs: 45_000,
      keepAliveTimeoutMs: 4_000,
      socketTimeoutMs: 20_000,
      maxHeadersCount: 64,
      maxRequestBodyBytes: 262_144,
    });

    expect(server.requestTimeout).toBe(15_000);
    expect(server.headersTimeout).toBe(45_000);
    expect(server.keepAliveTimeout).toBe(4_000);
    expect(server.maxHeadersCount).toBe(64);
    expect(timeoutMs).toBe(20_000);
    expect(timeoutHandler).toBeTypeOf("function");

    timeoutHandler?.({ destroy });
    expect(destroy).toHaveBeenCalledOnce();
  });
});
