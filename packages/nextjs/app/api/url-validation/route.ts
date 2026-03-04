import { NextRequest, NextResponse } from "next/server";
import { resolve4, resolve6 } from "dns/promises";
import { eq, inArray } from "drizzle-orm";
import { db } from "~~/lib/db";
import { urlValidations } from "~~/lib/db/schema";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";
import { checkRateLimit } from "~~/utils/rateLimit";
import { resolveEmbed } from "~~/utils/resolveEmbed";

const RATE_LIMIT_GET = { limit: 100, windowMs: 60_000 };

/** Check whether an IP address belongs to a private/reserved range. */
function isPrivateIp(ip: string): boolean {
  // IPv4
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every(p => p >= 0 && p <= 255)) {
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local
  return false;
}

/**
 * Block URLs that could be used for SSRF (internal network probing).
 * Rejects: non-HTTPS, IP-address hostnames, localhost, *.local, *.internal,
 * single-label hostnames (no dots), and hostnames that resolve to private IPs.
 */
async function isSafeUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname.toLowerCase();

  // Reject localhost
  if (hostname === "localhost") return false;

  // Reject single-label hostnames (no dots — e.g. "internal-service")
  if (!hostname.includes(".")) return false;

  // Reject *.local and *.internal TLDs
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;

  // Reject IPv4 addresses (e.g. 169.254.169.254)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;

  // Reject IPv6 addresses (bracketed in URLs, parsed hostname strips brackets)
  if (hostname.startsWith("[") || hostname.includes(":")) return false;

  // DNS rebinding protection: resolve hostname and reject private/reserved IPs.
  // Note: TOCTOU race exists (fetch may resolve differently), but this raises
  // the bar significantly against DNS rebinding attacks.
  try {
    const ipv4 = await resolve4(hostname).catch(() => [] as string[]);
    const ipv6 = await resolve6(hostname).catch(() => [] as string[]);
    const allIps = [...ipv4, ...ipv6];
    if (allIps.length === 0) return false;
    if (allIps.some(isPrivateIp)) return false;
  } catch {
    return false;
  }

  return true;
}
const RATE_LIMIT_POST = { limit: 20, windowMs: 60_000 };
const MAX_URLS_PER_REQUEST = 20;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24h

interface ValidationResult {
  isValid: boolean;
  checkedAt: string;
}

/**
 * GET /api/url-validation?urls=url1,url2,...
 * Returns cached validation results from the database.
 */
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMIT_GET);
  if (limited) return limited;

  const urlsParam = request.nextUrl.searchParams.get("urls");
  if (!urlsParam) {
    return NextResponse.json({ error: "Missing urls parameter" }, { status: 400 });
  }

  const urls = urlsParam.split(",").map(decodeURIComponent).slice(0, MAX_URLS_PER_REQUEST);
  if (urls.length === 0) {
    return NextResponse.json({ results: {} });
  }

  const rows = await db.select().from(urlValidations).where(inArray(urlValidations.url, urls));

  const results: Record<string, ValidationResult | null> = {};
  const rowMap = new Map(rows.map(r => [r.url, r]));

  for (const url of urls) {
    const row = rowMap.get(url);
    if (row) {
      results[url] = {
        isValid: row.isValid,
        checkedAt: row.checkedAt.toISOString(),
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
  const limited = checkRateLimit(request, RATE_LIMIT_POST);
  if (limited) return limited;

  let body: { urls?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const urls = body.urls?.slice(0, MAX_URLS_PER_REQUEST);
  if (!urls || urls.length === 0) {
    return NextResponse.json({ error: "Missing or empty urls array" }, { status: 400 });
  }

  // Fetch existing results
  const existing = await db.select().from(urlValidations).where(inArray(urlValidations.url, urls));
  const existingMap = new Map(existing.map(r => [r.url, r]));

  const now = new Date();
  const stale = now.getTime() - STALE_THRESHOLD_MS;

  // Find URLs that need (re-)validation
  const toValidate = urls.filter(url => {
    const row = existingMap.get(url);
    if (!row) return true;
    return row.checkedAt.getTime() < stale;
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
  for (const [url, isValid] of newResults) {
    const info = detectPlatform(url);
    const existingRow = existingMap.get(url);

    if (existingRow) {
      await db
        .update(urlValidations)
        .set({ isValid, checkedAt: now, platform: info.type })
        .where(eq(urlValidations.id, existingRow.id));
    } else {
      await db.insert(urlValidations).values({
        url,
        isValid,
        platform: info.type,
        checkedAt: now,
      });
    }
  }

  // Build response
  const allResults: Record<string, ValidationResult> = {};
  for (const url of urls) {
    const newResult = newResults.get(url);
    if (newResult !== undefined) {
      allResults[url] = { isValid: newResult, checkedAt: now.toISOString() };
    } else {
      const row = existingMap.get(url);
      if (row) {
        allResults[url] = { isValid: row.isValid, checkedAt: row.checkedAt.toISOString() };
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

      case "generic": {
        if (!(await isSafeUrl(url))) return false;
        // HEAD request with manual redirect handling to prevent SSRF via open redirects
        const res = await fetch(url, {
          method: "HEAD",
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
        });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          if (!location) return false;
          let target: string;
          try {
            target = new URL(location, url).toString();
          } catch {
            return false;
          }
          if (!(await isSafeUrl(target))) return false;
          const res2 = await fetch(target, {
            method: "HEAD",
            redirect: "manual",
            signal: AbortSignal.timeout(10_000),
          });
          return res2.ok || (res2.status >= 300 && res2.status < 400);
        }
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
