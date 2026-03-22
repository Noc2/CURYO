import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { MAX_CONTENT_DESCRIPTION_LENGTH } from "~~/lib/contentDescription";
import { db } from "~~/lib/db";
import { contentMetadata } from "~~/lib/db/schema";
import { ResponseTooLargeError, readResponseJson } from "~~/utils/fetchBodyLimit";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 30, windowMs: 60_000 }; // 30 req/min per IP
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_RESPONSE_BYTES = 1024 * 1024; // 1 MB cap on upstream response

function getTimestampMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Proxy for RAWG API to avoid exposing API key client-side.
 * Usage: GET /api/rawg?slug=elden-ring
 */
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;
  const slug = request.nextUrl.searchParams.get("slug");

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const cacheKey = `rawg:${slug}`;

  // Check DB cache
  try {
    const [cached] = await db.select().from(contentMetadata).where(eq(contentMetadata.url, cacheKey)).limit(1);
    if (cached && Date.now() - getTimestampMs(cached.fetchedAt) < CACHE_TTL_MS) {
      return NextResponse.json({
        name: cached.title,
        description_raw: cached.description,
        background_image: cached.imageUrl,
        metacritic: cached.stars, // reuse stars column for metacritic score
        released: cached.releaseYear,
      });
    }
  } catch (e) {
    console.warn("[rawg] cache read failed, falling through to API:", e);
  }

  const apiKey = process.env.RAWG_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RAWG API key not configured" }, { status: 500 });
  }

  try {
    const response = await fetch(`https://api.rawg.io/api/games/${slug}?key=${apiKey}`, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json({ error: "RAWG API error" }, { status: response.status });
    }

    const data = await readResponseJson<any>(response, MAX_RESPONSE_BYTES);
    const result = {
      name: data.name,
      description_raw: data.description_raw?.slice(0, MAX_CONTENT_DESCRIPTION_LENGTH),
      background_image: data.background_image,
      metacritic: data.metacritic,
      released: data.released,
    };

    // Cache the result (fire-and-forget) — skip if no useful data
    if (result.name || result.background_image) {
      db.insert(contentMetadata)
        .values({
          url: cacheKey,
          thumbnailUrl: result.background_image ?? null,
          title: result.name ?? null,
          description: result.description_raw ?? null,
          imageUrl: result.background_image ?? null,
          stars: result.metacritic ?? null,
          releaseYear: result.released ?? null,
          fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: contentMetadata.url,
          set: {
            thumbnailUrl: result.background_image ?? null,
            title: result.name ?? null,
            description: result.description_raw ?? null,
            imageUrl: result.background_image ?? null,
            stars: result.metacritic ?? null,
            releaseYear: result.released ?? null,
            fetchedAt: new Date(),
          },
        })
        .catch(e => console.warn("[rawg] cache write failed:", e));
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return NextResponse.json({ error: "RAWG API response too large" }, { status: 502 });
    }
    return NextResponse.json({ error: "Failed to fetch from RAWG" }, { status: 502 });
  }
}
