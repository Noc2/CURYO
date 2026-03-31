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
      httpAuth: {
        mode: "none",
        realm: "curyo-mcp",
        tokenHashes: [],
        scopes: ["mcp:read"],
        tokens: [],
      },
      httpRateLimit: {
        enabled: true,
        windowMs: 60_000,
        readRequestsPerWindow: 120,
        writeRequestsPerWindow: 20,
        trustedProxyHeaders: [],
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
    expect(config.ponderTimeoutMs).toBe(2500);
    expect(config.httpAuth.mode).toBe("none");
    expect(config.httpRateLimit).toEqual({
      enabled: true,
      windowMs: 60_000,
      readRequestsPerWindow: 120,
      writeRequestsPerWindow: 20,
      trustedProxyHeaders: [],
    });
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
  });

  it("requires a bearer token when bearer auth is enabled", () => {
    expect(() =>
      loadConfig({
        CURYO_MCP_HTTP_AUTH_MODE: "bearer",
      }),
    ).toThrow("CURYO_MCP_HTTP_BEARER_TOKEN, CURYO_MCP_HTTP_BEARER_TOKENS, or CURYO_MCP_HTTP_TOKENS_JSON is required");
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

  it("loads HTTP rate limit overrides", () => {
    const config = loadConfig({
      CURYO_MCP_HTTP_RATE_LIMIT_ENABLED: "true",
      CURYO_MCP_HTTP_RATE_LIMIT_WINDOW_MS: "15000",
      CURYO_MCP_HTTP_RATE_LIMIT_READ_LIMIT: "55",
      CURYO_MCP_HTTP_RATE_LIMIT_WRITE_LIMIT: "7",
      CURYO_MCP_HTTP_TRUSTED_PROXY_HEADERS: "x-real-ip,x-forwarded-for",
    });

    expect(config.httpRateLimit).toEqual({
      enabled: true,
      windowMs: 15000,
      readRequestsPerWindow: 55,
      writeRequestsPerWindow: 7,
      trustedProxyHeaders: ["x-real-ip", "x-forwarded-for"],
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
