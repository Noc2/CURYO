import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { HttpRateLimitConfig } from "../config.js";

interface RateLimitBucket {
  count: number;
  expiresAt: number;
}

const FORWARDED_FOR_HEADER = "x-forwarded-for";
const FORWARDED_HEADER = "forwarded";
const REAL_IP_HEADER = "x-real-ip";
const FALLBACK_FINGERPRINT_HEADERS = [
  "user-agent",
  "accept-language",
  "accept",
  "origin",
  "referer",
] as const;
const rateLimitBuckets = new Map<string, RateLimitBucket>();
let lastCleanupAt = 0;

export class HttpRateLimitError extends Error {
  readonly statusCode: number;
  readonly retryAfterSeconds: number;
  readonly limit: number;
  readonly policy: "read" | "write";

  constructor(message: string, retryAfterSeconds: number, limit: number, policy: "read" | "write") {
    super(message);
    this.name = "HttpRateLimitError";
    this.statusCode = 429;
    this.retryAfterSeconds = retryAfterSeconds;
    this.limit = limit;
    this.policy = policy;
  }
}

export function enforceHttpRateLimit(
  request: IncomingMessage,
  rateLimitConfig: HttpRateLimitConfig,
  authInfo: AuthInfo | undefined,
  requestPath: string,
): void {
  if (!rateLimitConfig.enabled) {
    return;
  }

  const policy = hasWriteScopes(authInfo) ? "write" : "read";
  const limit = policy === "write" ? rateLimitConfig.writeRequestsPerWindow : rateLimitConfig.readRequestsPerWindow;
  if (limit <= 0) {
    return;
  }

  const now = Date.now();
  cleanupExpiredBuckets(now);

  const windowStartedAt = now - (now % rateLimitConfig.windowMs);
  const expiresAt = windowStartedAt + rateLimitConfig.windowMs;
  const subject = resolveRateLimitSubject(request, rateLimitConfig, authInfo);
  const method = (request.method ?? "UNKNOWN").toUpperCase();
  const key = hashIdentifier(`${requestPath}:${method}:${windowStartedAt}:${policy}:${subject}`);
  const existingBucket = rateLimitBuckets.get(key);

  if (existingBucket) {
    existingBucket.count += 1;
    if (existingBucket.count > limit) {
      throw createRateLimitError(existingBucket.expiresAt, now, limit, policy);
    }
    return;
  }

  rateLimitBuckets.set(key, { count: 1, expiresAt });
}

export function __resetHttpRateLimitStateForTests(): void {
  rateLimitBuckets.clear();
  lastCleanupAt = 0;
}

function hasWriteScopes(authInfo: AuthInfo | undefined): boolean {
  return (authInfo?.scopes ?? []).some((scope) => scope === "mcp:write" || scope.startsWith("mcp:write:"));
}

function createRateLimitError(expiresAt: number, now: number, limit: number, policy: "read" | "write"): HttpRateLimitError {
  const retryAfterSeconds = Math.max(1, Math.ceil((expiresAt - now) / 1000));
  const message =
    policy === "write"
      ? "Too many write-capable MCP requests in the current window"
      : "Too many MCP requests in the current window";
  return new HttpRateLimitError(message, retryAfterSeconds, limit, policy);
}

function cleanupExpiredBuckets(now: number): void {
  if (now - lastCleanupAt < 30_000) {
    return;
  }

  lastCleanupAt = now;
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.expiresAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}

function resolveRateLimitSubject(
  request: IncomingMessage,
  rateLimitConfig: HttpRateLimitConfig,
  authInfo: AuthInfo | undefined,
): string {
  const clientId = authInfo?.clientId ?? "anonymous";
  const tokenKind = typeof authInfo?.extra?.tokenKind === "string" ? authInfo.extra.tokenKind : "anonymous";
  const subject = typeof authInfo?.extra?.subject === "string" ? authInfo.extra.subject.toLowerCase() : null;
  const networkIdentity = resolveNetworkIdentity(request, rateLimitConfig);

  return [clientId, tokenKind, subject, networkIdentity].filter(Boolean).join("|");
}

function resolveNetworkIdentity(request: IncomingMessage, rateLimitConfig: HttpRateLimitConfig): string {
  const trustedHeaderIp = getTrustedClientIp(request, rateLimitConfig.trustedProxyHeaders);
  if (trustedHeaderIp) {
    return `ip:${trustedHeaderIp}`;
  }

  const socketIp = request.socket?.remoteAddress?.trim();
  if (socketIp && !isLikelyProxyHopIp(socketIp)) {
    return `ip:${socketIp}`;
  }

  return `fingerprint:${buildFallbackFingerprint(request)}`;
}

function getTrustedClientIp(request: IncomingMessage, trustedHeaders: readonly string[]): string | null {
  for (const headerName of trustedHeaders) {
    const headerValue = request.headers[headerName];
    const ip = extractIpFromHeader(headerName, Array.isArray(headerValue) ? headerValue[0] : headerValue);
    if (ip) {
      return ip;
    }
  }

  return null;
}

function extractIpFromHeader(headerName: string, value: string | undefined): string | null {
  if (!value?.trim()) {
    return null;
  }

  if (headerName === FORWARDED_HEADER) {
    const match = value.match(/for=(?:"?\[?)([^;\],"]+)/i);
    return match?.[1]?.trim() || null;
  }

  const firstValue = value
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);

  return firstValue || null;
}

function buildFallbackFingerprint(request: IncomingMessage): string {
  const headers = request.headers;
  const parts = FALLBACK_FINGERPRINT_HEADERS.map((headerName) => {
    const value = headers[headerName];
    return Array.isArray(value) ? value[0] ?? "" : value ?? "";
  });

  const host = Array.isArray(headers.host) ? headers.host[0] ?? "" : headers.host ?? "";
  return hashIdentifier([...parts, host, request.url ?? ""].join("\n"));
}

function isLikelyProxyHopIp(value: string): boolean {
  const normalized = value.split("%", 1)[0].trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === "localhost" || normalized === "::1") {
    return true;
  }

  if (normalized.startsWith("::ffff:")) {
    return isLikelyProxyHopIp(normalized.slice("::ffff:".length));
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    const octets = normalized.split(".").map(part => Number.parseInt(part, 10));
    if (octets.length !== 4 || octets.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }

    if (octets[0] === 10 || octets[0] === 127) {
      return true;
    }

    if (octets[0] === 169 && octets[1] === 254) {
      return true;
    }

    if (octets[0] === 192 && octets[1] === 168) {
      return true;
    }

    return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
  }

  if (ipVersion === 6) {
    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("::ffff:127.")
    );
  }

  return false;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
