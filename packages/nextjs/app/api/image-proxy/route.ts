import { NextRequest, NextResponse } from "next/server";
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
  "pbs.twimg.com",
  "media.rawg.io",
  "avatars.githubusercontent.com",
  "api.scryfall.com",
  "cards.scryfall.io",
  "img.youtube.com",
  "i.ytimg.com",
]);

const MAX_RESPONSE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
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
    const res = await fetch(url, { next: { revalidate: 86400 }, redirect: "manual" });

    // If the upstream redirects, re-validate the target against the allowlist
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return new NextResponse(null, { status: 502 });
      let redirectUrl: URL;
      try {
        redirectUrl = new URL(location, url);
      } catch {
        return new NextResponse(null, { status: 502 });
      }
      if (!ALLOWED_HOSTS.has(redirectUrl.hostname)) {
        return new NextResponse(null, { status: 403 });
      }
      // Follow the validated redirect once (no further chaining)
      const redirectRes = await fetch(redirectUrl.toString(), { next: { revalidate: 86400 }, redirect: "manual" });
      if (!redirectRes.ok) return new NextResponse(null, { status: redirectRes.status });
      const ct = redirectRes.headers.get("content-type") || "image/png";
      if (!ct.startsWith("image/")) return new NextResponse(null, { status: 502 });
      const cl = Number(redirectRes.headers.get("content-length") || 0);
      if (cl > MAX_RESPONSE_SIZE) return new NextResponse(null, { status: 413 });
      const buf = await redirectRes.arrayBuffer();
      if (buf.byteLength > MAX_RESPONSE_SIZE) return new NextResponse(null, { status: 413 });
      return new NextResponse(buf, {
        headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400, immutable" },
      });
    }

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const contentType = res.headers.get("content-type") || "image/png";
    if (!contentType.startsWith("image/")) {
      return new NextResponse(null, { status: 502 });
    }

    const contentLength = Number(res.headers.get("content-length") || 0);
    if (contentLength > MAX_RESPONSE_SIZE) {
      return new NextResponse(null, { status: 413 });
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > MAX_RESPONSE_SIZE) {
      return new NextResponse(null, { status: 413 });
    }

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
