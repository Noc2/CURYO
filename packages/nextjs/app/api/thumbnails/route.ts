import { NextRequest, NextResponse } from "next/server";
import { resolveContentMetadataBatch } from "~~/lib/contentMetadata/server";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const MAX_URLS = 40;

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const urls = Array.isArray((body as { urls?: unknown[] })?.urls)
    ? (body as { urls: unknown[] }).urls.filter((url): url is string => typeof url === "string").slice(0, MAX_URLS)
    : [];

  if (urls.length === 0) {
    return NextResponse.json({ error: "urls array required" }, { status: 400 });
  }

  const items = await resolveContentMetadataBatch(urls);
  return NextResponse.json({ items });
}
