import { NextRequest, NextResponse } from "next/server";
import { resolveContentMetadata } from "~~/lib/contentMetadata/server";
import { checkRateLimit } from "~~/utils/rateLimit";
import { isSafeUrl } from "~~/utils/urlSafety";

const RATE_LIMIT = { limit: 200, windowMs: 60_000 }; // 200 req/min per IP

/**
 * Embed metadata proxy — resolves thumbnails and metadata server-side.
 * Avoids CORS issues, hides API keys, and caches results via Next.js fetch cache.
 *
 * Usage: GET /api/thumbnail?url=https://en.wikipedia.org/wiki/Bitcoin
 * Returns: { thumbnailUrl, title?, description?, imageUrl?, authors?, releaseYear?, symbol? }
 */
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (!(await isSafeUrl(url))) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
  }

  return NextResponse.json(await resolveContentMetadata(url));
}
