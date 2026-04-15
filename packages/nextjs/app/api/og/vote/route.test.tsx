import { NextRequest } from "next/server";
import { GET } from "./route";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

const originalFetch = globalThis.fetch;
const originalPonderUrl = process.env.NEXT_PUBLIC_PONDER_URL;

function buildContentResponse() {
  return new Response(
    JSON.stringify({
      content: {
        id: "88",
        title: "A disputed piece of content",
        description: "A compact summary for social previews.",
        rating: 50,
        ratingBps: 5_000,
        totalVotes: 1,
        lastActivityAt: "1776160800",
        openRound: null,
      },
    }),
    {
      headers: {
        "content-type": "application/json",
      },
    },
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_PONDER_URL = "https://ponder.example/api";
  globalThis.fetch = originalFetch;
});

after(() => {
  globalThis.fetch = originalFetch;

  if (originalPonderUrl === undefined) {
    delete process.env.NEXT_PUBLIC_PONDER_URL;
  } else {
    process.env.NEXT_PUBLIC_PONDER_URL = originalPonderUrl;
  }
});

test("caches versioned vote social cards for crawlers", async () => {
  const requestedUrls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    requestedUrls.push(input.toString());
    return buildContentResponse();
  }) as typeof fetch;

  const response = await GET(
    new NextRequest("https://www.curyo.xyz/api/og/vote?content=88&rv=r-88-5000-1-0-1776160800"),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "public, max-age=86400, immutable");
  assert.equal(
    response.headers.get("cdn-cache-control"),
    "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800",
  );
  assert.equal(
    response.headers.get("vercel-cdn-cache-control"),
    "public, max-age=86400, stale-while-revalidate=604800, stale-if-error=604800",
  );
  assert.deepEqual(requestedUrls, ["https://ponder.example/api/content/88"]);
});

test("keeps fallback vote social cards uncached", async () => {
  const response = await GET(new NextRequest("https://www.curyo.xyz/api/og/vote?content=bad"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cdn-cache-control"), null);
  assert.equal(response.headers.get("vercel-cdn-cache-control"), null);
});
