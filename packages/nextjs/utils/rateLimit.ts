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

const CLEANUP_INTERVAL_MS = 60_000;

let initPromise: Promise<void> | null = null;
let lastCleanup = 0;

async function ensureRateLimitTable() {
  if (!initPromise) {
    initPromise = (async () => {
      await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS api_rate_limits (
          key TEXT PRIMARY KEY,
          request_count INTEGER NOT NULL,
          window_started_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS api_rate_limits_expires_at_idx
        ON api_rate_limits (expires_at)
      `);
    })();
  }

  await initPromise;
}

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function getClientIp(request: NextRequest): string {
  const nextRequest = request as NextRequest & { ip?: string };

  return (
    nextRequest.ip?.trim() ||
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("fly-client-ip")?.trim() ||
    request.headers.get("fastly-client-ip")?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

async function cleanupExpiredEntries(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  await dbClient.execute({
    sql: "DELETE FROM api_rate_limits WHERE expires_at <= ?",
    args: [now],
  });
}

/**
 * Check rate limit for a request. Returns a 429 NextResponse if exceeded,
 * or null if the request is within limits.
 */
export async function checkRateLimit(request: NextRequest, config: RateLimitConfig): Promise<NextResponse | null> {
  const now = Date.now();
  const windowStartedAt = now - (now % config.windowMs);
  const expiresAt = windowStartedAt + config.windowMs;
  const ip = getClientIp(request);
  const key = hashIdentifier(`${request.nextUrl.pathname}:${windowStartedAt}:${ip}`);

  await ensureRateLimitTable();
  await cleanupExpiredEntries(now);

  const result = await dbClient.execute({
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

  return null;
}
