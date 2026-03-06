import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "~~/lib/db";
import { contentMetadata } from "~~/lib/db/schema";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";
import { checkRateLimit } from "~~/utils/rateLimit";
import { EmbedResult, resolveEmbed } from "~~/utils/resolveEmbed";

const RATE_LIMIT = { limit: 200, windowMs: 60_000 }; // 200 req/min per IP
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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

  // Check DB cache
  try {
    const [cached] = await db.select().from(contentMetadata).where(eq(contentMetadata.url, url)).limit(1);
    if (cached && Date.now() - cached.fetchedAt.getTime() < CACHE_TTL_MS) {
      const result: EmbedResult = {
        thumbnailUrl: cached.thumbnailUrl,
        ...(cached.title && { title: cached.title }),
        ...(cached.description && { description: cached.description }),
        ...(cached.imageUrl && { imageUrl: cached.imageUrl }),
        ...(cached.authors && { authors: JSON.parse(cached.authors) }),
        ...(cached.releaseYear && { releaseYear: cached.releaseYear }),
        ...(cached.symbol && { symbol: cached.symbol }),
        ...(cached.stars != null && { stars: cached.stars }),
        ...(cached.forks != null && { forks: cached.forks }),
        ...(cached.language && { language: cached.language }),
      };
      return NextResponse.json(result);
    }
  } catch (e) {
    console.warn("[thumbnail] cache read failed, falling through to API:", e);
  }

  const info = detectPlatform(url);
  const result = await resolveEmbed(info.type, info.id, info.metadata);

  // Cache the result (fire-and-forget) — skip empty failures
  if (result.thumbnailUrl || result.title || result.description) {
    db.insert(contentMetadata)
      .values({
        url,
        thumbnailUrl: result.thumbnailUrl,
        title: result.title ?? null,
        description: result.description ?? null,
        imageUrl: result.imageUrl ?? null,
        authors: result.authors ? JSON.stringify(result.authors) : null,
        releaseYear: result.releaseYear ?? null,
        symbol: result.symbol ?? null,
        stars: result.stars ?? null,
        forks: result.forks ?? null,
        language: result.language ?? null,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: contentMetadata.url,
        set: {
          thumbnailUrl: result.thumbnailUrl,
          title: result.title ?? null,
          description: result.description ?? null,
          imageUrl: result.imageUrl ?? null,
          authors: result.authors ? JSON.stringify(result.authors) : null,
          releaseYear: result.releaseYear ?? null,
          symbol: result.symbol ?? null,
          stars: result.stars ?? null,
          forks: result.forks ?? null,
          language: result.language ?? null,
          fetchedAt: new Date(),
        },
      })
      .catch(e => console.warn("[thumbnail] cache write failed:", e));
  }

  return NextResponse.json(result);
}
