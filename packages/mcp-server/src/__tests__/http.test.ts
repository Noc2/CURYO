import { describe, expect, it } from "vitest";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PonderClient } from "../clients/ponder.js";
import { handleStreamableHttpRequest, resolveAdvertisedHttpUrl } from "../http.js";

interface MockResponse {
  headers: Record<string, string>;
  headersSent: boolean;
  statusCode: number;
  body: string;
  destroyError?: Error;
  setHeader(name: string, value: string): void;
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
  const config = {
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
    httpAuth: {
      mode: "none" as const,
      realm: "curyo-mcp",
      tokenHashes: [],
      scopes: ["mcp:read"],
      tokens: [],
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
    },
  };

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
    expect(JSON.parse(response.body)).toMatchObject({
      status: "ready",
      checks: {
        ponder: "ok",
      },
    });
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
          },
        ],
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.headers["WWW-Authenticate"]).toContain('Bearer realm="curyo-mcp"');
    expect(JSON.parse(response.body)).toEqual({
      error: "Missing bearer token",
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
