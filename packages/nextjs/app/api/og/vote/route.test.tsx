import { NextRequest } from "next/server";
import { GET } from "./route";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

const originalFetch = globalThis.fetch;
const originalPonderUrl = process.env.NEXT_PUBLIC_PONDER_URL;
const onePixelPng = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=", "base64"),
);

function buildContentResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      content: {
        id: "88",
        url: "https://www.youtube.com/watch?v=qRv7G7WpOoU",
        title: "A disputed piece of content",
        description: "A compact summary for social previews.",
        rating: 50,
        ratingBps: 5_000,
        totalVotes: 1,
        lastActivityAt: "1776160800",
        openRound: null,
        ...overrides,
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
    const url = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url === "https://ponder.example/api/content/88") {
      return buildContentResponse();
    }

    if (url === "https://img.youtube.com/vi/qRv7G7WpOoU/hqdefault.jpg") {
      return new Response(onePixelPng, {
        headers: {
          "content-type": "image/png",
        },
      });
    }

    throw new Error(`Unexpected fetch: ${url}`);
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
  assert.ok((await response.arrayBuffer()).byteLength > 0);
  assert.deepEqual(requestedUrls, [
    "https://ponder.example/api/content/88",
    "https://img.youtube.com/vi/qRv7G7WpOoU/hqdefault.jpg",
  ]);
});

test("keeps fallback vote social cards uncached", async () => {
  const response = await GET(new NextRequest("https://www.curyo.xyz/api/og/vote?content=bad"));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.equal(response.headers.get("cdn-cache-control"), null);
  assert.equal(response.headers.get("vercel-cdn-cache-control"), null);
});
