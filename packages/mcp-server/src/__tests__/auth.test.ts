import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { createMcpSessionToken } from "@curyo/node-utils/mcpSessionToken";
import { authenticateRequest, HttpAuthError } from "../auth.js";
import type { HttpAuthConfig } from "../config.js";

const bearerAuthConfig: HttpAuthConfig = {
  mode: "bearer",
  realm: "curyo-mcp",
  tokenHashes: [
    "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
  ],
  tokens: [
    {
      tokenHash: "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94",
      clientId: "static-bearer:930bbdc51b6a",
      scopes: ["mcp:read"],
      identityId: null,
      notBefore: null,
      expiresAt: null,
      subject: null,
      kind: "static",
    },
  ],
  scopes: ["mcp:read"],
  sessionKeys: [],
};

describe("authenticateRequest", () => {
  it("allows requests through when auth is disabled", () => {
    const result = authenticateRequest({ headers: {} } as IncomingMessage, {
      mode: "none",
      realm: "curyo-mcp",
      tokenHashes: [],
      tokens: [],
      scopes: ["mcp:read"],
      sessionKeys: [],
    });

    expect(result).toBeUndefined();
  });

  it("throws when the bearer token is missing", () => {
    expect(() => authenticateRequest({ headers: {} } as IncomingMessage, bearerAuthConfig)).toThrow(HttpAuthError);
  });

  it("includes resource metadata guidance in bearer challenges when provided", () => {
    try {
      authenticateRequest(
        { headers: {} } as IncomingMessage,
        bearerAuthConfig,
        {
          requiredScopes: ["mcp:read"],
          resourceMetadataUrl: "https://mcp.curyo.xyz/.well-known/oauth-protected-resource/mcp",
        },
      );
      throw new Error("Expected authenticateRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpAuthError);
      const authError = error as HttpAuthError;
      expect(authError.wwwAuthenticate).toContain('resource_metadata="https://mcp.curyo.xyz/.well-known/oauth-protected-resource/mcp"');
      expect(authError.wwwAuthenticate).toContain('scope="mcp:read"');
    }
  });

  it("rejects bearer tokens that lack the required scope", () => {
    try {
      authenticateRequest(
        {
          headers: {
            authorization: "Bearer secret-token",
          },
        } as IncomingMessage,
        bearerAuthConfig,
        {
          requiredScopes: ["metrics:read"],
        },
      );
      throw new Error("Expected authenticateRequest to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpAuthError);
      const authError = error as HttpAuthError;
      expect(authError.statusCode).toBe(403);
      expect(authError.wwwAuthenticate).toContain('error="insufficient_scope"');
      expect(authError.wwwAuthenticate).toContain('scope="metrics:read"');
    }
  });

  it("returns auth info for a valid bearer token", () => {
    const authInfo = authenticateRequest(
      {
        headers: {
          authorization: "Bearer secret-token",
        },
      } as IncomingMessage,
      bearerAuthConfig,
    );

    expect(authInfo).toMatchObject({
      clientId: "static-bearer:930bbdc51b6a",
      scopes: ["mcp:read"],
      extra: {
        keyId: "930bbdc51b6a",
        authMode: "bearer",
        identityId: null,
        tokenKind: "static",
        subject: null,
      },
    });
  });

  it("rejects expired bearer tokens", () => {
    expect(() =>
      authenticateRequest(
        {
          headers: {
            authorization: "Bearer secret-token",
          },
        } as IncomingMessage,
        {
          ...bearerAuthConfig,
          tokens: [
            {
              ...bearerAuthConfig.tokens[0],
              expiresAt: "2020-01-01T00:00:00.000Z",
            },
          ],
        },
      ),
    ).toThrow("Bearer token has expired");
  });

  it("accepts signed MCP wallet sessions", () => {
    const key = {
      keyId: "nextjs-prod",
      secret: "super-secret-signing-key",
      issuer: "curyo-nextjs",
      audience: "curyo-mcp",
    } as const;
    const { token } = createMcpSessionToken({
      key,
      subject: "0x7777777777777777777777777777777777777777",
      clientId: "wallet:0x7777",
      scopes: ["mcp:read", "mcp:write:vote"],
      identityId: "writer",
      ttlMs: 60_000,
    });

    const authInfo = authenticateRequest(
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      } as IncomingMessage,
      {
        ...bearerAuthConfig,
        tokens: [],
        tokenHashes: [],
        sessionKeys: [key],
      },
    );

    expect(authInfo).toMatchObject({
      clientId: "wallet:0x7777",
      scopes: ["mcp:read", "mcp:write:vote"],
      extra: {
        keyId: "nextjs-prod",
        identityId: "writer",
        tokenKind: "session",
        subject: "0x7777777777777777777777777777777777777777",
        issuer: "curyo-nextjs",
        audience: "curyo-mcp",
      },
    });
  });
});
