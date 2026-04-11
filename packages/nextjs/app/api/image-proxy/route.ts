import { NextRequest, NextResponse } from "next/server";
import { getSafeHuggingFaceImageUrl } from "~~/lib/content/huggingFaceImage";
import { ResponseTooLargeError, readResponseBytes } from "~~/utils/fetchBodyLimit";
import { checkRateLimit } from "~~/utils/rateLimit";

/**
 * Image proxy — fetches external images server-side to avoid CORS issues.
 * Only allows specific trusted hostnames.
 *
 * Usage: GET /api/image-proxy?url=https://coin-images.coingecko.com/coins/images/1/large/bitcoin.png
 */

const RATE_LIMIT = { limit: 60, windowMs: 60_000 }; // 60 req/min per IP

const ALLOWED_HOSTS = new Set([
  "coin-images.coingecko.com",
  "assets.coingecko.com",
  "covers.openlibrary.org",
  "image.tmdb.org",
  "upload.wikimedia.org",
  "cdn-avatars.huggingface.co",
  "cdn-thumbnails.huggingface.co",
  "huggingface.co",
  "pbs.twimg.com",
  "media.rawg.io",
  "avatars.githubusercontent.com",
  "api.scryfall.com",
  "cards.scryfall.io",
  "img.youtube.com",
  "i.ytimg.com",
]);

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_REDIRECTS = 3;
const UPSTREAM_FETCH_OPTIONS = { cache: "no-store" as const, redirect: "manual" as const };
const BROWSER_IMAGE_CACHE_CONTROL = "public, max-age=86400, immutable";
const CDN_IMAGE_CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800";

function buildImageResponse(bytes: Uint8Array, contentType: string) {
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": BROWSER_IMAGE_CACHE_CONTROL,
      "CDN-Cache-Control": CDN_IMAGE_CACHE_CONTROL,
      "Vercel-CDN-Cache-Control": CDN_IMAGE_CACHE_CONTROL,
    },
  });
}

function normalizeProxyImageUrl(url: string): string {
  return getSafeHuggingFaceImageUrl(url) ?? url;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400;
}

function isAllowedOpenLibraryCoverRedirect(sourceHostname: string, targetHostname: string): boolean {
  if (sourceHostname === "covers.openlibrary.org") return targetHostname === "archive.org";
  return sourceHostname === "archive.org" && targetHostname.endsWith(".us.archive.org");
}

function isAllowedRedirectTarget(sourceHostname: string, targetHostname: string): boolean {
  return ALLOWED_HOSTS.has(targetHostname) || isAllowedOpenLibraryCoverRedirect(sourceHostname, targetHostname);
}

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT, { allowOnStoreUnavailable: true });
  if (limited) return limited;

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const normalizedUrl = normalizeProxyImageUrl(url);

  let parsed: URL;
  try {
    parsed = new URL(normalizedUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "Only HTTPS URLs allowed" }, { status: 400 });
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 });
  }

  try {
    let currentUrl = parsed;

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
      const res = await fetch(currentUrl.toString(), UPSTREAM_FETCH_OPTIONS);

      // If the upstream redirects, re-validate each target before following it.
      if (isRedirectStatus(res.status)) {
        if (redirectCount === MAX_REDIRECTS) return new NextResponse(null, { status: 502 });

        const location = res.headers.get("location");
        if (!location) return new NextResponse(null, { status: 502 });

        let redirectUrl: URL;
        try {
          redirectUrl = new URL(location, currentUrl);
        } catch {
          return new NextResponse(null, { status: 502 });
        }

        if (redirectUrl.protocol !== "https:") {
          return NextResponse.json({ error: "Only HTTPS URLs allowed" }, { status: 400 });
        }
        if (!isAllowedRedirectTarget(currentUrl.hostname, redirectUrl.hostname)) {
          return new NextResponse(null, { status: 403 });
        }

        currentUrl = redirectUrl;
        continue;
      }

      if (!res.ok) {
        return new NextResponse(null, { status: res.status });
      }

      const contentType = res.headers.get("content-type") || "image/png";
      if (!contentType.startsWith("image/")) {
        return new NextResponse(null, { status: 502 });
      }

      const buffer = await readResponseBytes(res, MAX_RESPONSE_SIZE);

      return buildImageResponse(buffer, contentType);
    }

    return new NextResponse(null, { status: 502 });
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return new NextResponse(null, { status: 413 });
    }
    return new NextResponse(null, { status: 502 });
  }
}
