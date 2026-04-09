import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { isIP } from "node:net";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import Redis from "ioredis";
import type { HttpRateLimitConfig } from "../config.js";

interface RateLimitBucket {
  count: number;
  expiresAt: number;
}

interface HttpRateLimitStore {
  increment(key: string, expiresAt: number, now: number): Promise<RateLimitBucket>;
  close?(): Promise<void>;
}

const FORWARDED_HEADER = "forwarded";
const FALLBACK_FINGERPRINT_HEADERS = [
  "user-agent",
  "accept-language",
  "accept",
  "origin",
  "referer",
] as const;
const rateLimitBuckets = new Map<string, RateLimitBucket>();
const rateLimitStoreCache = new Map<string, HttpRateLimitStore>();
let lastCleanupAt = 0;
let rateLimitStoreFactory: ((config: HttpRateLimitConfig) => HttpRateLimitStore) | null = null;

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

export class HttpRateLimitStoreError extends Error {
  readonly statusCode: number;

  constructor(message: string) {
    super(message);
    this.name = "HttpRateLimitStoreError";
    this.statusCode = 503;
  }
}

export async function enforceHttpRateLimit(
  request: IncomingMessage,
  rateLimitConfig: HttpRateLimitConfig,
  authInfo: AuthInfo | undefined,
  requestPath: string,
): Promise<void> {
  if (!rateLimitConfig.enabled) {
    return;
  }

  const policy = hasWriteScopes(authInfo) ? "write" : "read";
  const limit = policy === "write" ? rateLimitConfig.writeRequestsPerWindow : rateLimitConfig.readRequestsPerWindow;
  if (limit <= 0) {
    return;
  }

  const now = Date.now();
  const windowStartedAt = now - (now % rateLimitConfig.windowMs);
  const expiresAt = windowStartedAt + rateLimitConfig.windowMs;
  const subject = resolveRateLimitSubject(request, rateLimitConfig, authInfo);
  const method = (request.method ?? "UNKNOWN").toUpperCase();
  const key = buildRateLimitKey(rateLimitConfig, requestPath, method, windowStartedAt, policy, subject);

  try {
    const bucket = await getRateLimitStore(rateLimitConfig).increment(key, expiresAt, now);
    if (bucket.count > limit) {
      throw createRateLimitError(bucket.expiresAt, now, limit, policy);
    }
  } catch (error) {
    if (error instanceof HttpRateLimitError) {
      throw error;
    }

    throw new HttpRateLimitStoreError(
      error instanceof Error ? `Rate limit backend unavailable: ${error.message}` : "Rate limit backend unavailable",
    );
  }
}

export function __resetHttpRateLimitStateForTests(): void {
  rateLimitBuckets.clear();
  for (const store of rateLimitStoreCache.values()) {
    void store.close?.();
  }
  rateLimitStoreCache.clear();
  rateLimitStoreFactory = null;
  lastCleanupAt = 0;
}

export function __setHttpRateLimitStoreFactoryForTests(
  factory: ((config: HttpRateLimitConfig) => HttpRateLimitStore) | null,
): void {
  rateLimitStoreFactory = factory;
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

function buildRateLimitKey(
  config: HttpRateLimitConfig,
  requestPath: string,
  method: string,
  windowStartedAt: number,
  policy: "read" | "write",
  subject: string,
): string {
  return `${config.redisKeyPrefix}:${hashIdentifier(`${requestPath}:${method}:${windowStartedAt}:${policy}:${subject}`)}`;
}

function getRateLimitStore(config: HttpRateLimitConfig): HttpRateLimitStore {
  if (rateLimitStoreFactory) {
    return rateLimitStoreFactory(config);
  }

  const cacheKey =
    config.store === "redis"
      ? `redis:${config.redisUrl ?? "missing"}:${config.redisKeyPrefix}:${config.redisConnectTimeoutMs}`
      : "memory";
  const cached = rateLimitStoreCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const store =
    config.store === "redis"
      ? new RedisHttpRateLimitStore(config.redisUrl ?? "", config.redisConnectTimeoutMs)
      : new MemoryHttpRateLimitStore();
  rateLimitStoreCache.set(cacheKey, store);
  return store;
}

class MemoryHttpRateLimitStore implements HttpRateLimitStore {
  async increment(key: string, expiresAt: number, now: number): Promise<RateLimitBucket> {
    cleanupExpiredBuckets(now);

    const existingBucket = rateLimitBuckets.get(key);
    if (existingBucket) {
      existingBucket.count += 1;
      return existingBucket;
    }

    const bucket = { count: 1, expiresAt };
    rateLimitBuckets.set(key, bucket);
    return bucket;
  }
}

class RedisHttpRateLimitStore implements HttpRateLimitStore {
  private readonly client: Redis;
  private connectPromise: Promise<void> | null = null;

  constructor(redisUrl: string, connectTimeoutMs: number) {
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      connectTimeout: connectTimeoutMs,
    });
    this.client.on("error", () => {});
  }

  async increment(key: string, expiresAt: number, now: number): Promise<RateLimitBucket> {
    await this.ensureConnected();

    const ttlMs = Math.max(1, expiresAt - now);
    const results = await this.client.multi().incr(key).pexpire(key, ttlMs, "NX").pttl(key).exec();
    if (!results) {
      throw new Error("Redis rate limit pipeline returned no result");
    }

    const count = parseRedisNumber(results[0]?.[1], "INCR");
    const remainingTtlMs = parseRedisNumber(results[2]?.[1], "PTTL");

    return {
      count,
      expiresAt: remainingTtlMs > 0 ? now + remainingTtlMs : expiresAt,
    };
  }

  async close(): Promise<void> {
    if (this.client.status === "end") {
      return;
    }

    await this.client.quit().catch(() => {
      this.client.disconnect();
    });
  }

  private async ensureConnected(): Promise<void> {
    if (this.client.status === "ready") {
      return;
    }

    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().finally(() => {
        this.connectPromise = null;
      });
    }

    await this.connectPromise;
  }
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
    const octets = normalized.split(".").map((part) => Number.parseInt(part, 10));
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
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

function parseRedisNumber(value: unknown, command: string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  throw new Error(`Redis ${command} result was not numeric`);
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
