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
  const matchedTokenHash = authConfig.tokenHashes.find((candidate) => safeEqualHex(candidate, tokenHash));
  if (!matchedTokenHash) {
    throw new HttpAuthError(
      "Invalid bearer token",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "The access token is invalid",
      }),
    );
  }

  const keyId = matchedTokenHash.slice(0, 12);

  return {
    token,
    clientId: `static-bearer:${keyId}`,
    scopes: authConfig.scopes,
    extra: {
      keyId,
      authMode: authConfig.mode,
    },
  };
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
