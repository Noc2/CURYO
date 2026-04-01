import { describe, expect, it } from "vitest";
import { loadConfig, normalizeBaseUrl, normalizeHttpPath, normalizeOptionalBaseUrl } from "../config.js";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://ponder.curyo.xyz/")).toBe("https://ponder.curyo.xyz");
    expect(normalizeBaseUrl("https://ponder.curyo.xyz/api/")).toBe("https://ponder.curyo.xyz/api");
  });

  it("rejects non-http protocols", () => {
    expect(() => normalizeBaseUrl("ftp://ponder.curyo.xyz")).toThrow("Ponder URL must use http or https");
  });
});

describe("loadConfig", () => {
  it("uses CURYO_PONDER_URL when present", () => {
    const config = loadConfig({
      CURYO_PONDER_URL: "https://ponder.curyo.xyz/",
      CURYO_MCP_SERVER_NAME: "curyo-test",
      CURYO_MCP_SERVER_VERSION: "1.2.3",
    });

    expect(config).toEqual({
      ponderBaseUrl: "https://ponder.curyo.xyz",
      ponderTimeoutMs: 10_000,
      serverName: "curyo-test",
      serverVersion: "1.2.3",
      transport: "stdio",
      httpHost: "127.0.0.1",
      httpPort: 3334,
      httpPath: "/mcp",
      httpPublicBaseUrl: null,
      httpCorsOrigin: "http://localhost:3000",
      httpAllowedOrigins: ["http://localhost:3000"],
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
        mode: "none",
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
        store: "memory",
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
    });
  });

  it("normalizes streamable HTTP config from env", () => {
    const config = loadConfig({
      CURYO_MCP_TRANSPORT: "streamable-http",
      CURYO_MCP_HTTP_HOST: "0.0.0.0",
      CURYO_MCP_HTTP_PORT: "4444",
      CURYO_MCP_HTTP_PATH: "rpc/",
      CURYO_MCP_HTTP_CORS_ORIGIN: "https://chatgpt.com",
      CURYO_MCP_PONDER_TIMEOUT_MS: "2500",
    });

    expect(config.transport).toBe("streamable-http");
    expect(config.httpHost).toBe("0.0.0.0");
    expect(config.httpPort).toBe(4444);
    expect(config.httpPath).toBe("/rpc");
    expect(config.httpPublicBaseUrl).toBe(null);
    expect(config.httpCorsOrigin).toBe("https://chatgpt.com");
    expect(config.httpAllowedOrigins).toEqual(["https://chatgpt.com"]);
    expect(config.httpAuthorizationServers).toEqual([]);
    expect(config.httpResourceDocumentationUrl).toBe(null);
    expect(config.httpServer).toEqual({
      requestTimeoutMs: 30_000,
      headersTimeoutMs: 60_000,
      keepAliveTimeoutMs: 5_000,
      socketTimeoutMs: 60_000,
      maxHeadersCount: 100,
      maxRequestBodyBytes: 1_048_576,
    });
    expect(config.ponderTimeoutMs).toBe(2500);
    expect(config.httpAuth.mode).toBe("none");
    expect(config.httpAuth.sessionKeys).toEqual([]);
    expect(config.httpRateLimit).toEqual({
      enabled: true,
      windowMs: 60_000,
      readRequestsPerWindow: 120,
      writeRequestsPerWindow: 20,
      trustedProxyHeaders: [],
      store: "memory",
      redisUrl: null,
      redisKeyPrefix: "curyo:mcp:ratelimit",
      redisConnectTimeoutMs: 2_000,
    });
  });

  it("rejects production streamable-http deployments that still point at localhost Ponder or CORS defaults", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        CURYO_MCP_TRANSPORT: "streamable-http",
        CURYO_MCP_HTTP_CORS_ORIGIN: "https://app.curyo.xyz",
        CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS: "x-real-ip",
      }),
    ).toThrow("CURYO_PONDER_URL or PONDER_URL must not point to localhost in production streamable-http deployments");

    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        CURYO_MCP_TRANSPORT: "streamable-http",
        CURYO_PONDER_URL: "https://ponder.curyo.xyz",
        CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS: "x-real-ip",
      }),
    ).toThrow("CURYO_MCP_HTTP_CORS_ORIGIN must not point to localhost in production streamable-http deployments");
  });

  it("requires trusted proxy headers for production streamable-http rate limiting", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        CURYO_MCP_TRANSPORT: "streamable-http",
        CURYO_PONDER_URL: "https://ponder.curyo.xyz",
        CURYO_MCP_HTTP_CORS_ORIGIN: "https://app.curyo.xyz",
      }),
    ).toThrow(
      "CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS is required in production when CURYO_MCP_TRANSPORT=streamable-http and rate limiting is enabled",
    );
  });

  it("requires at least one non-localhost allowed origin for production streamable-http deployments", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        CURYO_MCP_TRANSPORT: "streamable-http",
        CURYO_PONDER_URL: "https://ponder.curyo.xyz",
        CURYO_MCP_HTTP_CORS_ORIGIN: "*",
        CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS: "x-real-ip",
      }),
    ).toThrow(
      "CURYO_MCP_HTTP_ALLOWED_ORIGINS or a non-wildcard CURYO_MCP_HTTP_CORS_ORIGIN/CURYO_MCP_PUBLIC_BASE_URL is required in production streamable-http deployments",
    );
  });

  it("allows production streamable-http deployments when Ponder, CORS, and proxy headers are explicit", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      CURYO_MCP_TRANSPORT: "streamable-http",
      CURYO_PONDER_URL: "https://ponder.curyo.xyz",
      CURYO_MCP_HTTP_CORS_ORIGIN: "https://app.curyo.xyz",
      CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS: "x-real-ip,x-forwarded-for",
    });

    expect(config.ponderBaseUrl).toBe("https://ponder.curyo.xyz");
    expect(config.httpCorsOrigin).toBe("https://app.curyo.xyz");
    expect(config.httpAllowedOrigins).toEqual(["https://app.curyo.xyz"]);
    expect(config.httpRateLimit.trustedProxyHeaders).toEqual(["x-real-ip", "x-forwarded-for"]);
    expect(config.httpRateLimit.store).toBe("memory");
  });

  it("allows explicit MCP origin allowlists separate from the CORS response origin", () => {
    const config = loadConfig({
      CURYO_MCP_TRANSPORT: "streamable-http",
      CURYO_MCP_HTTP_CORS_ORIGIN: "*",
      CURYO_MCP_PUBLIC_BASE_URL: "https://mcp.curyo.xyz/base/",
      CURYO_MCP_HTTP_ALLOWED_ORIGINS: "https://curyo.xyz,https://www.curyo.xyz",
    });

    expect(config.httpPublicBaseUrl).toBe("https://mcp.curyo.xyz/base");
    expect(config.httpAllowedOrigins).toEqual(["https://curyo.xyz", "https://www.curyo.xyz"]);
  });

  it("loads protected resource metadata config for OAuth discovery", () => {
    const config = loadConfig({
      CURYO_MCP_TRANSPORT: "streamable-http",
      CURYO_MCP_HTTP_AUTHORIZATION_SERVERS: "https://auth.curyo.xyz,https://login.curyo.xyz/issuer/",
      CURYO_MCP_HTTP_RESOURCE_DOCUMENTATION_URL: "https://curyo.xyz/docs/ai/",
    });

    expect(config.httpAuthorizationServers).toEqual(["https://auth.curyo.xyz", "https://login.curyo.xyz/issuer"]);
    expect(config.httpResourceDocumentationUrl).toBe("https://curyo.xyz/docs/ai");
  });

  it("loads HTTP hardening overrides", () => {
    const config = loadConfig({
      CURYO_MCP_HTTP_REQUEST_TIMEOUT_MS: "15000",
      CURYO_MCP_HTTP_HEADERS_TIMEOUT_MS: "45000",
      CURYO_MCP_HTTP_KEEP_ALIVE_TIMEOUT_MS: "4000",
      CURYO_MCP_HTTP_SOCKET_TIMEOUT_MS: "45000",
      CURYO_MCP_HTTP_MAX_HEADERS_COUNT: "64",
      CURYO_MCP_HTTP_MAX_REQUEST_BODY_BYTES: "262144",
    });

    expect(config.httpServer).toEqual({
      requestTimeoutMs: 15_000,
      headersTimeoutMs: 45_000,
      keepAliveTimeoutMs: 4_000,
      socketTimeoutMs: 45_000,
      maxHeadersCount: 64,
      maxRequestBodyBytes: 262_144,
    });
  });

  it("requires HTTP headers timeout to exceed the keep-alive timeout", () => {
    expect(() =>
      loadConfig({
        CURYO_MCP_HTTP_HEADERS_TIMEOUT_MS: "5000",
        CURYO_MCP_HTTP_KEEP_ALIVE_TIMEOUT_MS: "5000",
      }),
    ).toThrow("CURYO_MCP_HTTP_HEADERS_TIMEOUT_MS must be greater than CURYO_MCP_HTTP_KEEP_ALIVE_TIMEOUT_MS");
  });

  it("normalizes an optional public base URL", () => {
    const config = loadConfig({
      CURYO_MCP_TRANSPORT: "streamable-http",
      CURYO_MCP_PUBLIC_BASE_URL: "https://mcp.curyo.xyz/base/",
    });

    expect(config.httpPublicBaseUrl).toBe("https://mcp.curyo.xyz/base");
  });

  it("loads static bearer auth config", () => {
    const config = loadConfig({
      CURYO_MCP_HTTP_AUTH_MODE: "bearer",
      CURYO_MCP_HTTP_BEARER_TOKENS: "token-a,token-b",
      CURYO_MCP_HTTP_AUTH_REALM: "curyo-prod",
      CURYO_MCP_HTTP_AUTH_SCOPES: "mcp:read,metrics:read",
    });

    expect(config.httpAuth.mode).toBe("bearer");
    expect(config.httpAuth.realm).toBe("curyo-prod");
    expect(config.httpAuth.tokenHashes).toHaveLength(2);
    expect(config.httpAuth.scopes).toEqual(["mcp:read", "metrics:read"]);
    expect(config.httpAuth.tokens).toHaveLength(2);
    expect(config.httpAuth.sessionKeys).toEqual([]);
  });

  it("requires a bearer token when bearer auth is enabled", () => {
    expect(() =>
      loadConfig({
        CURYO_MCP_HTTP_AUTH_MODE: "bearer",
      }),
    ).toThrow(
      "CURYO_MCP_HTTP_BEARER_TOKEN, CURYO_MCP_HTTP_BEARER_TOKENS, CURYO_MCP_HTTP_TOKENS_JSON, or CURYO_MCP_HTTP_SESSION_SECRET(S)_JSON is required",
    );
  });

  it("loads scoped bearer tokens bound to write identities", () => {
    const config = loadConfig({
      CURYO_MCP_HTTP_AUTH_MODE: "bearer",
      CURYO_MCP_HTTP_TOKENS_JSON: JSON.stringify([
        {
          token: "writer-token",
          clientId: "claude-prod",
          scopes: ["mcp:read", "mcp:write:vote"],
          identityId: "writer",
          kind: "session",
          subject: "0xabc",
          expiresAt: "2030-01-01T00:00:00.000Z",
        },
      ]),
      CURYO_MCP_WRITE_ENABLED: "true",
      CURYO_MCP_RPC_URL: "https://rpc.celo.example",
      CURYO_MCP_CHAIN_ID: "11142220",
      CURYO_MCP_WRITE_IDENTITIES: JSON.stringify([
        {
          id: "writer",
          privateKey: `0x${"11".repeat(32)}`,
          frontendAddress: "0x7777777777777777777777777777777777777777",
        },
      ]),
    });

    expect(config.httpAuth.tokens).toEqual([
      expect.objectContaining({
        clientId: "claude-prod",
        scopes: ["mcp:read", "mcp:write:vote"],
        identityId: "writer",
        kind: "session",
        subject: "0xabc",
        expiresAt: "2030-01-01T00:00:00.000Z",
      }),
    ]);
    expect(config.write.enabled).toBe(true);
    expect(config.write.defaultIdentityId).toBe(null);
    expect(config.write.identities).toEqual([
      expect.objectContaining({
        id: "writer",
        frontendAddress: "0x7777777777777777777777777777777777777777",
      }),
    ]);
    expect(config.write.policy).toEqual({
      maxVoteStake: null,
      allowedSubmissionHosts: [],
      submissionRevealPollIntervalMs: 500,
      submissionRevealTimeoutMs: 30000,
    });
    expect(config.write.contracts).toEqual(
      expect.objectContaining({
        votingEngine: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
        frontendRegistry: expect.stringMatching(/^0x[0-9a-fA-F]{40}$/),
      }),
    );
  });

  it("requires known write identities for scoped bearer tokens", () => {
    expect(() =>
      loadConfig({
        CURYO_MCP_HTTP_AUTH_MODE: "bearer",
        CURYO_MCP_HTTP_TOKENS_JSON: JSON.stringify([
          {
            token: "writer-token",
            identityId: "missing",
          },
        ]),
      }),
    ).toThrow('references unknown identity "missing"');
  });

  it("allows bearer mode with signed session keys and no static bearer tokens", () => {
    const config = loadConfig({
      CURYO_MCP_HTTP_AUTH_MODE: "bearer",
      CURYO_MCP_HTTP_SESSION_SECRET: "super-secret-signing-key",
      CURYO_MCP_HTTP_SESSION_KEY_ID: "nextjs-prod",
      CURYO_MCP_HTTP_SESSION_ISSUER: "curyo-nextjs",
      CURYO_MCP_HTTP_SESSION_AUDIENCE: "curyo-mcp",
    });

    expect(config.httpAuth.tokens).toEqual([]);
    expect(config.httpAuth.sessionKeys).toEqual([
      {
        keyId: "nextjs-prod",
        secret: "super-secret-signing-key",
        issuer: "curyo-nextjs",
        audience: "curyo-mcp",
      },
    ]);
  });

  it("loads HTTP rate limit overrides", () => {
    const config = loadConfig({
      CURYO_MCP_HTTP_RATE_LIMIT_ENABLED: "true",
      CURYO_MCP_HTTP_RATE_LIMIT_WINDOW_MS: "15000",
      CURYO_MCP_HTTP_RATE_LIMIT_READ_LIMIT: "55",
      CURYO_MCP_HTTP_RATE_LIMIT_WRITE_LIMIT: "7",
      CURYO_MCP_HTTP_RATE_LIMIT_STORE: "redis",
      CURYO_MCP_HTTP_RATE_LIMIT_REDIS_URL: "rediss://default:secret@redis.example.upstash.io:6379",
      CURYO_MCP_HTTP_RATE_LIMIT_REDIS_KEY_PREFIX: "curyo:test:ratelimit",
      CURYO_MCP_HTTP_RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS: "5000",
      CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS: "x-real-ip,x-forwarded-for",
    });

    expect(config.httpRateLimit).toEqual({
      enabled: true,
      windowMs: 15000,
      readRequestsPerWindow: 55,
      writeRequestsPerWindow: 7,
      trustedProxyHeaders: ["x-real-ip", "x-forwarded-for"],
      store: "redis",
      redisUrl: "rediss://default:secret@redis.example.upstash.io:6379",
      redisKeyPrefix: "curyo:test:ratelimit",
      redisConnectTimeoutMs: 5000,
    });
  });

  it("requires a Redis URL when the HTTP rate limiter uses the Redis store", () => {
    expect(() =>
      loadConfig({
        CURYO_MCP_HTTP_RATE_LIMIT_STORE: "redis",
      }),
    ).toThrow("CURYO_MCP_HTTP_RATE_LIMIT_REDIS_URL is required when CURYO_MCP_HTTP_RATE_LIMIT_STORE=redis");
  });

  it("loads MCP write policy overrides", () => {
    const config = loadConfig({
      CURYO_MCP_WRITE_ENABLED: "true",
      CURYO_MCP_RPC_URL: "https://rpc.celo.example",
      CURYO_MCP_CHAIN_ID: "11142220",
      CURYO_MCP_WRITE_IDENTITIES: JSON.stringify([
        {
          id: "writer",
          privateKey: `0x${"11".repeat(32)}`,
          frontendAddress: "0x7777777777777777777777777777777777777777",
        },
      ]),
      CURYO_MCP_WRITE_MAX_VOTE_STAKE: "5000000000000000000",
      CURYO_MCP_WRITE_SUBMISSION_HOST_ALLOWLIST: "curyo.xyz,example.com",
      CURYO_MCP_WRITE_SUBMISSION_REVEAL_POLL_MS: "250",
      CURYO_MCP_WRITE_SUBMISSION_REVEAL_TIMEOUT_MS: "45000",
    });

    expect(config.write.policy).toEqual({
      maxVoteStake: 5000000000000000000n,
      allowedSubmissionHosts: ["curyo.xyz", "example.com"],
      submissionRevealPollIntervalMs: 250,
      submissionRevealTimeoutMs: 45000,
    });
  });
});

describe("normalizeHttpPath", () => {
  it("ensures a single leading slash and no trailing slash", () => {
    expect(normalizeHttpPath("mcp")).toBe("/mcp");
    expect(normalizeHttpPath("/mcp/")).toBe("/mcp");
    expect(normalizeHttpPath("/")).toBe("/");
  });
});

describe("normalizeOptionalBaseUrl", () => {
  it("returns null for empty values and normalizes valid URLs", () => {
    expect(normalizeOptionalBaseUrl(undefined)).toBe(null);
    expect(normalizeOptionalBaseUrl(" https://mcp.curyo.xyz/ ")).toBe("https://mcp.curyo.xyz");
  });
});
