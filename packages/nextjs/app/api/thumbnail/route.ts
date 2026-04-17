import { NextRequest, NextResponse } from "next/server";
import { resolveContentMetadata } from "~~/lib/contentMetadata/server";
import { checkRateLimit } from "~~/utils/rateLimit";
import { isSafeUrl } from "~~/utils/urlSafety";

const RATE_LIMIT = { limit: 200, windowMs: 60_000 }; // 200 req/min per IP

/**
 * Media metadata proxy — resolves direct image and YouTube thumbnails server-side.
 *
 * Usage: GET /api/thumbnail?url=https://www.youtube.com/watch?v=...
 * Returns: `ContentMetadataResult` from `lib/contentMetadata/types.ts`.
 */
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT, { allowOnStoreUnavailable: true });
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
