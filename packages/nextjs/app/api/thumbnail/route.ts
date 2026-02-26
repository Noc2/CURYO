import { NextRequest, NextResponse } from "next/server";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";
import { checkRateLimit } from "~~/utils/rateLimit";
import { resolveEmbed } from "~~/utils/resolveEmbed";

const RATE_LIMIT = { limit: 200, windowMs: 60_000 }; // 200 req/min per IP

/**
 * Embed metadata proxy — resolves thumbnails and metadata server-side.
 * Avoids CORS issues, hides API keys, and caches results via Next.js fetch cache.
 *
 * Usage: GET /api/thumbnail?url=https://en.wikipedia.org/wiki/Bitcoin
 * Returns: { thumbnailUrl, title?, description?, imageUrl?, authors?, releaseYear?, symbol? }
 */
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

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return NextResponse.json({ error: "Only HTTP(S) URLs allowed" }, { status: 400 });
  }

  // Check for a static thumbnail first (no external call needed)
  const staticThumbnail = getThumbnailUrl(url);
  if (staticThumbnail) {
    return NextResponse.json({ thumbnailUrl: staticThumbnail });
  }

  const info = detectPlatform(url);
  const result = await resolveEmbed(info.type, info.id, info.metadata);

  return NextResponse.json(result);
}
