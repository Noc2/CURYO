import { NextRequest, NextResponse } from "next/server";
import { shouldPerformLiveValidation } from "./liveValidation";
import { inArray } from "drizzle-orm";
import { db } from "~~/lib/db";
import { urlValidations } from "~~/lib/db/schema";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";
import { checkRateLimit } from "~~/utils/rateLimit";
import { resolveEmbed } from "~~/utils/resolveEmbed";

const RATE_LIMIT_GET = { limit: 100, windowMs: 60_000 };
const RATE_LIMIT_POST = { limit: 20, windowMs: 60_000 };
const MAX_URLS_PER_REQUEST = 10;
const MAX_URL_LENGTH = 2048;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

interface ValidationResult {
  isValid: boolean;
  checkedAt: string;
}

type UrlValidationRow = typeof urlValidations.$inferSelect;

function isNonNullString(value: string | null): value is string {
  return value !== null;
}

function serializeTimestamp(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

function getTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function normalizeValidationUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_URL_LENGTH) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return normalized;
  } catch {
    return null;
  }
}

/**
 * GET /api/url-validation?urls=url1,url2,...
 * Returns cached validation results from the database.
 */
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT_GET, { allowOnStoreUnavailable: true });
  if (limited) return limited;

  const urlsParam = request.nextUrl.searchParams.get("urls");
  if (!urlsParam) {
    return NextResponse.json({ error: "Missing urls parameter" }, { status: 400 });
  }

  const rawUrls = urlsParam.split(",");
  if (rawUrls.length > MAX_URLS_PER_REQUEST) {
    return NextResponse.json({ error: `Too many URLs (max ${MAX_URLS_PER_REQUEST})` }, { status: 400 });
  }

  const normalizedUrls = rawUrls.map(normalizeValidationUrl);
  if (normalizedUrls.some(url => url === null)) {
    return NextResponse.json({ error: "Invalid URL list" }, { status: 400 });
  }

  const urls = normalizedUrls.filter(isNonNullString);
  const liveValidationUrls = urls.filter(shouldPerformLiveValidation);

  if (urls.length === 0) {
    return NextResponse.json({ results: {} });
  }

  let rows: UrlValidationRow[] = [];
  if (liveValidationUrls.length > 0) {
    try {
      rows = await db.select().from(urlValidations).where(inArray(urlValidations.url, liveValidationUrls));
    } catch (error) {
      console.warn("[url-validation] cache read failed, returning uncached results:", error);
    }
  }

  const results: Record<string, ValidationResult | null> = {};
  const rowMap = new Map(rows.map(r => [r.url, r]));

  for (const url of urls) {
    if (!shouldPerformLiveValidation(url)) {
      results[url] = null;
      continue;
    }

    const row = rowMap.get(url);
    if (row) {
      results[url] = {
        isValid: row.isValid,
        checkedAt: serializeTimestamp(row.checkedAt),
      };
    } else {
      results[url] = null;
    }
  }

  return NextResponse.json({ results });
}

/**
 * POST /api/url-validation
 * Body: { urls: string[] }
 * Validates unchecked/stale URLs, stores results, returns all.
 */
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT_POST, { allowOnStoreUnavailable: true });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || !Array.isArray((body as { urls?: unknown }).urls)) {
    return NextResponse.json({ error: "Missing or invalid urls array" }, { status: 400 });
  }

  const rawUrls = (body as { urls: unknown[] }).urls;
  if (rawUrls.length === 0) {
    return NextResponse.json({ error: "Missing or empty urls array" }, { status: 400 });
  }
  if (rawUrls.length > MAX_URLS_PER_REQUEST) {
    return NextResponse.json({ error: `Too many URLs (max ${MAX_URLS_PER_REQUEST})` }, { status: 400 });
  }

  const normalizedUrls = rawUrls.map(normalizeValidationUrl);
  if (normalizedUrls.some(url => url === null)) {
    return NextResponse.json({ error: "Invalid URL list" }, { status: 400 });
  }

  const urls = normalizedUrls.filter(isNonNullString);
  const liveValidationUrls = urls.filter(shouldPerformLiveValidation);

  // Fetch existing results
  let existing: UrlValidationRow[] = [];
  if (liveValidationUrls.length > 0) {
    try {
      existing = await db.select().from(urlValidations).where(inArray(urlValidations.url, liveValidationUrls));
    } catch (error) {
      console.warn("[url-validation] cache read failed, validating without cache:", error);
    }
  }
  const existingMap = new Map(existing.map(r => [r.url, r]));

  const now = new Date();
  const stale = now.getTime() - STALE_THRESHOLD_MS;

  // Find URLs that need (re-)validation
  const toValidate = liveValidationUrls.filter(url => {
    const row = existingMap.get(url);
    if (!row) return true;
    return getTimestampMs(row.checkedAt) < stale;
  });

  // Validate in parallel (with concurrency limit)
  const CONCURRENCY = 5;
  const newResults = new Map<string, boolean>();

  for (let i = 0; i < toValidate.length; i += CONCURRENCY) {
    const batch = toValidate.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(url => validateUrl(url)));

    for (let j = 0; j < batch.length; j++) {
      const result = results[j];
      const isValid = result.status === "fulfilled" ? result.value : false;
      newResults.set(batch[j], isValid);
    }
  }

  // Upsert results into DB
  try {
    for (const [url, isValid] of newResults) {
      const info = detectPlatform(url);
      await db
        .insert(urlValidations)
        .values({
          url,
          isValid,
          platform: info.type,
          checkedAt: now,
        })
        .onConflictDoUpdate({
          target: urlValidations.url,
          set: {
            isValid,
            platform: info.type,
            checkedAt: now,
          },
        });
    }
  } catch (error) {
    console.warn("[url-validation] cache write failed, returning uncached results:", error);
  }

  // Build response
  const allResults: Record<string, ValidationResult> = {};
  for (const url of liveValidationUrls) {
    const newResult = newResults.get(url);
    if (newResult !== undefined) {
      allResults[url] = { isValid: newResult, checkedAt: now.toISOString() };
    } else {
      const row = existingMap.get(url);
      if (row) {
        allResults[url] = { isValid: row.isValid, checkedAt: serializeTimestamp(row.checkedAt) };
      }
    }
  }

  return NextResponse.json({ results: allResults });
}

/**
 * Validate whether a URL points to an existing resource.
 * Uses platform-specific checks for accuracy.
 */
async function validateUrl(url: string): Promise<boolean> {
  const info = detectPlatform(url);

  try {
    switch (info.type) {
      case "youtube": {
        // YouTube static thumbnails always return 200 even for deleted videos.
        // Use oEmbed API which returns non-200 for unavailable videos.
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
          signal: AbortSignal.timeout(10_000),
        });
        return res.ok;
      }

      case "twitch": {
        // Twitch oEmbed check
        const res = await fetch(`https://api.twitch.tv/v5/oembed?url=${encodeURIComponent(url)}`, {
          signal: AbortSignal.timeout(10_000),
        });
        return res.ok;
      }

      default: {
        // Some platforms (e.g. Scryfall) provide static thumbnail URLs derived
        // from the content URL without an API call. Verify with a HEAD request.
        const staticThumb = getThumbnailUrl(url);
        if (staticThumb) {
          const res = await fetch(staticThumb, {
            method: "HEAD",
            redirect: "follow",
            signal: AbortSignal.timeout(10_000),
          });
          return res.ok;
        }

        // For platforms with API-based resolution (wikipedia, tmdb, etc.),
        // use resolveEmbed — if thumbnailUrl resolves, the resource exists
        const result = await resolveEmbed(info.type, info.id, info.metadata);
        return result.thumbnailUrl !== null;
      }
    }
  } catch {
    // Network errors, timeouts → treat as invalid
    return false;
  }
}
