import { NextRequest } from "next/server";
import { GET } from "./route";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { type QueryResult, type QueryResultRow } from "pg";
import { type QueryInput } from "~~/lib/db";
import { __setRateLimitStoreForTests } from "~~/utils/rateLimit";

const originalFetch = globalThis.fetch;

function buildQueryResult(rows: QueryResultRow[]): QueryResult<QueryResultRow> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows,
  };
}

function setAllowedRateLimitStore() {
  __setRateLimitStoreForTests({
    execute: async (input: QueryInput) => {
      const sql = typeof input === "string" ? input : ((input as { sql?: string }).sql ?? "");
      if (sql.includes("api_rate_limits")) {
        return buildQueryResult([{ request_count: 1 }]);
      }

      return buildQueryResult([]);
    },
  });
}

beforeEach(() => {
  setAllowedRateLimitStore();
});

after(() => {
  globalThis.fetch = originalFetch;
  __setRateLimitStoreForTests(null);
});

test("revalidates HTTPS redirects before following them", async () => {
  const calls: string[] = [];
  const requestOptions: RequestInit[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    requestOptions.push(init ?? {});

    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: {
          location: "https://assets.coingecko.com/final.png",
        },
      });
    }

    return new Response(new Uint8Array([1, 2, 3]), {
      headers: {
        "content-type": "image/png",
      },
    });
  }) as typeof fetch;

  const response = await GET(
    new NextRequest("http://localhost/api/image-proxy?url=https://coin-images.coingecko.com/initial.png"),
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
  assert.deepEqual(calls, ["https://coin-images.coingecko.com/initial.png", "https://assets.coingecko.com/final.png"]);
  assert.deepEqual(requestOptions, [
    { cache: "no-store", redirect: "manual" },
    { cache: "no-store", redirect: "manual" },
  ]);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3]);
});

test("follows Open Library cover redirects through archive hosts", async () => {
  const calls: string[] = [];
  const requestOptions: RequestInit[] = [];
  const coverUrl = "https://covers.openlibrary.org/b/id/14542536-L.jpg";
  const archiveUrl = "https://archive.org/download/l_covers_0014/l_covers_0014_54.zip/0014542536-L.jpg";
  const archiveImageUrl =
    "https://ia800505.us.archive.org/view_archive.php?archive=/35/items/l_covers_0014/l_covers_0014_54.zip&file=0014542536-L.jpg";

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    requestOptions.push(init ?? {});

    if (calls.length === 1) {
      return new Response(null, {
        status: 302,
        headers: {
          location: archiveUrl,
        },
      });
    }

    if (calls.length === 2) {
      return new Response(null, {
        status: 302,
        headers: {
          location: archiveImageUrl,
        },
      });
    }

    return new Response(new Uint8Array([16, 17, 18]), {
      headers: {
        "content-type": "image/jpeg",
      },
    });
  }) as typeof fetch;

  const response = await GET(new NextRequest(`http://localhost/api/image-proxy?url=${encodeURIComponent(coverUrl)}`));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(calls, [coverUrl, archiveUrl, archiveImageUrl]);
  assert.deepEqual(requestOptions, [
    { cache: "no-store", redirect: "manual" },
    { cache: "no-store", redirect: "manual" },
    { cache: "no-store", redirect: "manual" },
  ]);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [16, 17, 18]);
});

test("rejects redirect targets that downgrade to http", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));

    return new Response(null, {
      status: 302,
      headers: {
        location: "http://assets.coingecko.com/final.png",
      },
    });
  }) as typeof fetch;

  const response = await GET(
    new NextRequest("http://localhost/api/image-proxy?url=https://coin-images.coingecko.com/initial.png"),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Only HTTPS URLs allowed" });
  assert.deepEqual(calls, ["https://coin-images.coingecko.com/initial.png"]);
});

test("continues serving images when the rate-limit backing store is unavailable", async () => {
  __setRateLimitStoreForTests({
    execute: async () => {
      throw new Error("database offline");
    },
  });

  globalThis.fetch = (async () => {
    return new Response(new Uint8Array([4, 5, 6]), {
      headers: {
        "content-type": "image/png",
      },
    });
  }) as typeof fetch;

  const response = await GET(
    new NextRequest("http://localhost/api/image-proxy?url=https://coin-images.coingecko.com/initial.png", {
      headers: {
        "x-forwarded-for": "203.0.113.77",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [4, 5, 6]);
});

test("allows Hugging Face repository image assets", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));

    return new Response(new Uint8Array([7, 8, 9]), {
      headers: {
        "content-type": "image/png",
      },
    });
  }) as typeof fetch;

  const response = await GET(
    new NextRequest(
      "http://localhost/api/image-proxy?url=https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png",
    ),
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
  assert.deepEqual(calls, ["https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png"]);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [7, 8, 9]);
});

test("allows Hugging Face social thumbnail assets", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));

    return new Response(new Uint8Array([13, 14, 15]), {
      headers: {
        "content-type": "image/png",
      },
    });
  }) as typeof fetch;

  const response = await GET(
    new NextRequest(
      "http://localhost/api/image-proxy?url=https://cdn-thumbnails.huggingface.co/social-thumbnails/models/google/gemma-4-E2B-it.png",
    ),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(calls, ["https://cdn-thumbnails.huggingface.co/social-thumbnails/models/google/gemma-4-E2B-it.png"]);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [13, 14, 15]);
});

test("normalizes escaped Hugging Face avatar URLs before proxying", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));

    return new Response(new Uint8Array([10, 11, 12]), {
      headers: {
        "content-type": "image/jpeg",
      },
    });
  }) as typeof fetch;

  const malformedAvatarUrl =
    "https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg&quot;,&quot;type&quot;:&quot;update&quot;,&quot;repoData&quot;:{}";

  const response = await GET(
    new NextRequest(`http://localhost/api/image-proxy?url=${encodeURIComponent(malformedAvatarUrl)}`),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/jpeg");
  assert.deepEqual(calls, [
    "https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg",
  ]);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [10, 11, 12]);
});
