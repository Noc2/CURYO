import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { authenticateRequest, HttpAuthError } from "../auth.js";
import type { HttpAuthConfig } from "../config.js";

const bearerAuthConfig: HttpAuthConfig = {
  mode: "bearer",
  realm: "curyo-mcp",
  tokenHashes: [
    "930bbdc51b6aed5c2a5678fd6e28dee7a05e8a4b643cfc0b4427c3efb86c0d94", // sha256("secret-token")
  ],
  scopes: ["mcp:read"],
};

describe("authenticateRequest", () => {
  it("allows requests through when auth is disabled", () => {
    const result = authenticateRequest({ headers: {} } as IncomingMessage, {
      mode: "none",
      realm: "curyo-mcp",
      tokenHashes: [],
      scopes: ["mcp:read"],
    });

    expect(result).toBeUndefined();
  });

  it("throws when the bearer token is missing", () => {
    expect(() => authenticateRequest({ headers: {} } as IncomingMessage, bearerAuthConfig)).toThrow(HttpAuthError);
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
      },
    });
  });
});
