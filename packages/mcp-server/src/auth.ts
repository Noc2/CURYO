import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { HttpAuthConfig } from "./config.js";

export class HttpAuthError extends Error {
  readonly statusCode: number;
  readonly wwwAuthenticate: string;

  constructor(message: string, wwwAuthenticate: string, statusCode = 401) {
    super(message);
    this.name = "HttpAuthError";
    this.statusCode = statusCode;
    this.wwwAuthenticate = wwwAuthenticate;
  }
}

export function authenticateRequest(request: IncomingMessage, authConfig: HttpAuthConfig): AuthInfo | undefined {
  if (authConfig.mode === "none") {
    return undefined;
  }

  const token = extractBearerToken(request.headers.authorization);
  if (!token) {
    throw new HttpAuthError(
      "Missing bearer token",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "Missing bearer token",
      }),
    );
  }

  const tokenHash = hashToken(token);
  const matchedToken = authConfig.tokens.find((candidate) => safeEqualHex(candidate.tokenHash, tokenHash));
  if (!matchedToken) {
    throw new HttpAuthError(
      "Invalid bearer token",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "The access token is invalid",
      }),
    );
  }

  ensureTokenIsActive(matchedToken, authConfig);

  const keyId = matchedToken.tokenHash.slice(0, 12);

  return {
    token,
    clientId: matchedToken.clientId,
    scopes: matchedToken.scopes,
    extra: {
      keyId,
      authMode: authConfig.mode,
      identityId: matchedToken.identityId,
      tokenKind: matchedToken.kind,
      subject: matchedToken.subject,
      notBefore: matchedToken.notBefore,
      expiresAt: matchedToken.expiresAt,
    },
  };
}

function ensureTokenIsActive(token: HttpAuthConfig["tokens"][number], authConfig: HttpAuthConfig): void {
  const now = Date.now();

  if (token.notBefore && now < Date.parse(token.notBefore)) {
    throw new HttpAuthError(
      "Bearer token is not active yet",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "The access token is not active yet",
      }),
    );
  }

  if (token.expiresAt && now >= Date.parse(token.expiresAt)) {
    throw new HttpAuthError(
      "Bearer token has expired",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "The access token has expired",
      }),
    );
  }
}

function extractBearerToken(header: string | string[] | undefined): string | null {
  if (!header) {
    return null;
  }

  const value = Array.isArray(header) ? header[0] : header;
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1]?.trim() || null;
}

function buildWwwAuthenticateHeader(
  authConfig: HttpAuthConfig,
  options?: {
    error?: string;
    errorDescription?: string;
  },
): string {
  const parts = [`Bearer realm="${authConfig.realm}"`];

  if (options?.error) {
    parts.push(`error="${escapeHeaderValue(options.error)}"`);
  }

  if (options?.errorDescription) {
    parts.push(`error_description="${escapeHeaderValue(options.errorDescription)}"`);
  }

  return parts.join(", ");
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
