import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 30, windowMs: 60_000 }; // 30 req/min per IP

/**
 * Proxy for RAWG API to avoid exposing API key client-side.
 * Usage: GET /api/rawg?slug=elden-ring
 */
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;
  const slug = request.nextUrl.searchParams.get("slug");

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
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

    const data = await response.json();
    return NextResponse.json({
      name: data.name,
      description_raw: data.description_raw?.slice(0, 500),
      background_image: data.background_image,
      metacritic: data.metacritic,
      released: data.released,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch from RAWG" }, { status: 502 });
  }
}
