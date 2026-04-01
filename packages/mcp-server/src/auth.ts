import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { McpSessionTokenError, verifyMcpSessionToken } from "@curyo/node-utils/mcpSessionToken";
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

interface HttpAuthChallengeOptions {
  requiredScopes?: string[];
  resourceMetadataUrl?: string;
}

export function authenticateRequest(
  request: IncomingMessage,
  authConfig: HttpAuthConfig,
  challengeOptions: HttpAuthChallengeOptions = {},
): AuthInfo | undefined {
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
        requiredScopes: challengeOptions.requiredScopes,
        resourceMetadataUrl: challengeOptions.resourceMetadataUrl,
      }),
    );
  }

  const tokenHash = hashToken(token);
  const matchedToken = authConfig.tokens.find((candidate) => safeEqualHex(candidate.tokenHash, tokenHash));
  if (matchedToken) {
    ensureTokenIsActive(matchedToken, authConfig, challengeOptions);

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

  if (authConfig.sessionKeys.length === 0) {
    throw new HttpAuthError(
      "Invalid bearer token",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "The access token is invalid",
        requiredScopes: challengeOptions.requiredScopes,
        resourceMetadataUrl: challengeOptions.resourceMetadataUrl,
      }),
    );
  }

  try {
    const { claims, key } = verifyMcpSessionToken(token, {
      keys: authConfig.sessionKeys,
    });

    return {
      token,
      clientId: claims.clientId,
      scopes: claims.scopes,
      extra: {
        keyId: key.keyId,
        authMode: authConfig.mode,
        identityId: claims.identityId,
        tokenKind: "session",
        subject: claims.sub,
        notBefore: new Date(claims.nbf * 1000).toISOString(),
        expiresAt: new Date(claims.exp * 1000).toISOString(),
        issuer: claims.iss,
        audience: claims.aud,
        sessionId: claims.jti,
      },
    };
  } catch (error) {
    const description = mapSessionTokenError(error);
    throw new HttpAuthError(
      description === "The access token has expired" ? "Bearer token has expired" : "Invalid bearer token",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: description,
        requiredScopes: challengeOptions.requiredScopes,
        resourceMetadataUrl: challengeOptions.resourceMetadataUrl,
      }),
    );
  }
}

function ensureTokenIsActive(
  token: HttpAuthConfig["tokens"][number],
  authConfig: HttpAuthConfig,
  challengeOptions: HttpAuthChallengeOptions,
): void {
  const now = Date.now();

  if (token.notBefore && now < Date.parse(token.notBefore)) {
    throw new HttpAuthError(
      "Bearer token is not active yet",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "The access token is not active yet",
        requiredScopes: challengeOptions.requiredScopes,
        resourceMetadataUrl: challengeOptions.resourceMetadataUrl,
      }),
    );
  }

  if (token.expiresAt && now >= Date.parse(token.expiresAt)) {
    throw new HttpAuthError(
      "Bearer token has expired",
      buildWwwAuthenticateHeader(authConfig, {
        error: "invalid_token",
        errorDescription: "The access token has expired",
        requiredScopes: challengeOptions.requiredScopes,
        resourceMetadataUrl: challengeOptions.resourceMetadataUrl,
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

export function buildWwwAuthenticateHeader(
  authConfig: HttpAuthConfig,
  options?: {
    error?: string;
    errorDescription?: string;
    requiredScopes?: string[];
    resourceMetadataUrl?: string;
  },
): string {
  const parts = [`Bearer realm="${authConfig.realm}"`];

  if (options?.resourceMetadataUrl) {
    parts.push(`resource_metadata="${escapeHeaderValue(options.resourceMetadataUrl)}"`);
  }

  if (options?.requiredScopes && options.requiredScopes.length > 0) {
    parts.push(`scope="${escapeHeaderValue(options.requiredScopes.join(" "))}"`);
  }

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

function mapSessionTokenError(error: unknown): string {
  if (!(error instanceof McpSessionTokenError)) {
    return "The access token is invalid";
  }

  switch (error.code) {
    case "TOKEN_EXPIRED":
      return "The access token has expired";
    case "TOKEN_NOT_ACTIVE":
      return "The access token is not active yet";
    case "INVALID_AUDIENCE":
    case "INVALID_ISSUER":
    case "UNKNOWN_KEY":
    case "INVALID_SIGNATURE":
    case "INVALID_TOKEN_FORMAT":
    case "INVALID_HEADER":
    case "INVALID_PAYLOAD":
    default:
      return "The access token is invalid";
  }
}
