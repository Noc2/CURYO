import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { dbClient } from "~~/lib/db";

/**
 * Shared fixed-window rate limiter backed by the application database.
 * This survives across stateless/serverless instances and avoids in-memory
 * counters that reset per process.
 */

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitOptions {
  /** Additional stable key parts, such as a normalized wallet address */
  extraKeyParts?: Array<string | number | bigint | null | undefined>;
}

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_LEASE_MS = 15_000;
const CLEANUP_ROW_KEY = "cleanup";

let initPromise: Promise<void> | null = null;
let lastCleanup = 0;

const DEV_FALLBACK_IP = "127.0.0.1";
const FORWARDED_FOR_HEADER = "x-forwarded-for";
const FORWARDED_HEADER = "forwarded";
const REAL_IP_HEADER = "x-real-ip";
const DEFAULT_VERCEL_TRUSTED_IP_HEADERS = [FORWARDED_FOR_HEADER, REAL_IP_HEADER] as const;
const FALLBACK_FINGERPRINT_HEADERS = [
  "user-agent",
  "accept-language",
  "accept",
  "sec-ch-ua",
  "sec-ch-ua-mobile",
  "sec-ch-ua-platform",
  "origin",
  "referer",
  "cookie",
] as const;

type RateLimitStore = Pick<typeof dbClient, "execute">;

let rateLimitStore: RateLimitStore = dbClient;

export function __setRateLimitStoreForTests(store: RateLimitStore | null) {
  rateLimitStore = store ?? dbClient;
  initPromise = null;
  lastCleanup = 0;
}

async function ensureRateLimitTable() {
  if (!initPromise) {
    initPromise = (async () => {
      await rateLimitStore.execute(`
        CREATE TABLE IF NOT EXISTS api_rate_limits (
          key TEXT PRIMARY KEY,
          request_count INTEGER NOT NULL,
          window_started_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      await rateLimitStore.execute(`
        CREATE INDEX IF NOT EXISTS api_rate_limits_expires_at_idx
        ON api_rate_limits (expires_at)
      `);
      await rateLimitStore.execute(`
        CREATE TABLE IF NOT EXISTS api_rate_limit_maintenance (
          name TEXT PRIMARY KEY,
          last_cleanup_started_at INTEGER NOT NULL,
          lease_expires_at INTEGER NOT NULL
        )
      `);
    })().catch(error => {
      initPromise = null;
      throw error;
    });
  }

  await initPromise;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isVercelDeployment(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function getTrustedRateLimitHeaders(): string[] {
  const configuredHeaders = (process.env.RATE_LIMIT_TRUSTED_IP_HEADERS ?? "")
    .split(",")
    .map(header => header.trim().toLowerCase())
    .filter(Boolean);

  if (configuredHeaders.length > 0) {
    return configuredHeaders;
  }

  if (isVercelDeployment()) {
    return [...DEFAULT_VERCEL_TRUSTED_IP_HEADERS];
  }

  return [];
}

function normalizeExtraKeyPart(value: string | number | bigint | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized ? normalized : null;
}

function parseForwardedIp(value: string): string | null {
  const match = value.match(/for=(?:"?\[?)([^;\],"]+)/i);
  return match?.[1]?.trim() || null;
}

function extractIpFromHeader(headerName: string, value: string | null): string | null {
  if (!value?.trim()) {
    return null;
  }

  if (headerName === FORWARDED_HEADER) {
    return parseForwardedIp(value);
  }

  const firstValue = value
    .split(",")
    .map(part => part.trim())
    .find(Boolean);

  return firstValue || null;
}

function getTrustedClientIp(request: NextRequest): string | null {
  const nextRequest = request as NextRequest & { ip?: string };

  if (nextRequest.ip?.trim()) {
    return nextRequest.ip.trim();
  }

  if (process.env.NODE_ENV === "development") {
    return (
      extractIpFromHeader(FORWARDED_FOR_HEADER, request.headers.get(FORWARDED_FOR_HEADER)) ??
      extractIpFromHeader(REAL_IP_HEADER, request.headers.get(REAL_IP_HEADER)) ??
      DEV_FALLBACK_IP
    );
  }

  for (const headerName of getTrustedRateLimitHeaders()) {
    const ip = extractIpFromHeader(headerName, request.headers.get(headerName));
    if (ip) {
      return ip;
    }
  }

  return null;
}

function buildFallbackFingerprint(request: NextRequest): string {
  const parts = FALLBACK_FINGERPRINT_HEADERS.map(header => request.headers.get(header)?.trim() ?? "");
  const fingerprint = parts.some(Boolean) ? parts.join("\n") : request.nextUrl.origin;
  return `fingerprint:${fingerprint}`;
}

export function resolveRateLimitSubject(request: NextRequest, options: RateLimitOptions = {}): string {
  const ip = getTrustedClientIp(request);
  const baseIdentity = ip ? `ip:${ip}` : buildFallbackFingerprint(request);
  const extraKeyParts = (options.extraKeyParts ?? [])
    .map(normalizeExtraKeyPart)
    .filter((part): part is string => !!part);
  return [baseIdentity, ...extraKeyParts].join("|");
}

async function cleanupExpiredEntries(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const leaseExpiresAt = now + CLEANUP_LEASE_MS;
  const cleanupLease = await rateLimitStore.execute({
    sql: `
      INSERT INTO api_rate_limit_maintenance (name, last_cleanup_started_at, lease_expires_at)
      VALUES (?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        last_cleanup_started_at = excluded.last_cleanup_started_at,
        lease_expires_at = excluded.lease_expires_at
      WHERE api_rate_limit_maintenance.lease_expires_at <= ?
        AND api_rate_limit_maintenance.last_cleanup_started_at <= ?
      RETURNING name
    `,
    args: [CLEANUP_ROW_KEY, now, leaseExpiresAt, now, now - CLEANUP_INTERVAL_MS],
  });

  if (cleanupLease.rows.length === 0) return;

  await rateLimitStore.execute({
    sql: "DELETE FROM api_rate_limits WHERE expires_at <= ?",
    args: [now],
  });
}

/**
 * Check rate limit for a request. Returns a 429 NextResponse if exceeded,
 * or null if the request is within limits.
 */
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig,
  options: RateLimitOptions = {},
): Promise<NextResponse | null> {
  const trustedClientIp = getTrustedClientIp(request);
  if (process.env.NODE_ENV === "production" && !trustedClientIp) {
    return NextResponse.json({ error: "Rate limiting is misconfigured" }, { status: 503 });
  }

  const now = Date.now();
  const windowStartedAt = now - (now % config.windowMs);
  const expiresAt = windowStartedAt + config.windowMs;
  const subject = [
    trustedClientIp ? `ip:${trustedClientIp}` : buildFallbackFingerprint(request),
    ...(options.extraKeyParts ?? []).map(normalizeExtraKeyPart).filter((part): part is string => !!part),
  ].join("|");
  const key = hashIdentifier(
    `${request.nextUrl.pathname}:${request.method.toUpperCase()}:${windowStartedAt}:${subject}`,
  );

  try {
    await ensureRateLimitTable();
    await cleanupExpiredEntries(now);

    const result = await rateLimitStore.execute({
      sql: `
        INSERT INTO api_rate_limits (key, request_count, window_started_at, expires_at)
        VALUES (?, 1, ?, ?)
        ON CONFLICT(key) DO UPDATE SET request_count = request_count + 1
        RETURNING request_count
      `,
      args: [key, windowStartedAt, expiresAt],
    });

    const requestCount = Number(result.rows[0]?.request_count ?? 0);
    if (requestCount > config.limit) {
      const retryAfter = Math.max(1, Math.ceil((expiresAt - now) / 1000));

      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }
  } catch (error) {
    console.warn(
      `[rate-limit] backing store unavailable for ${request.method.toUpperCase()} ${request.nextUrl.pathname}; allowing request`,
      error,
    );
  }

  return null;
}
