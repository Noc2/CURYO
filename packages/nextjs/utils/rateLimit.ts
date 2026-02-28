import { NextRequest, NextResponse } from "next/server";

/**
 * Simple in-memory sliding-window rate limiter.
 * Not shared across serverless instances — good enough for single-process
 * deployments and local dev; use Redis/KV for multi-instance production.
 */

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

// Evict stale entries every 60s to prevent unbounded memory growth
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const cutoff = now - windowMs;
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

/**
 * Check rate limit for a request. Returns a 429 NextResponse if exceeded,
 * or null if the request is within limits.
 */
export function checkRateLimit(request: NextRequest, config: RateLimitConfig): NextResponse | null {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    (request as NextRequest & { ip?: string }).ip ||
    "unknown";
  // Namespace by route path so different API routes don't share counters
  const key = `${ip}:${request.nextUrl.pathname}`;
  const now = Date.now();
  const cutoff = now - config.windowMs;

  cleanup(config.windowMs);

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Drop timestamps outside the window
  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= config.limit) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  entry.timestamps.push(now);
  return null;
}
