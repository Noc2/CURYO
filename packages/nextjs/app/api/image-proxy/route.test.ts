import { NextRequest } from "next/server";
import { GET } from "./route";
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import { __setRateLimitStoreForTests } from "~~/utils/rateLimit";

const originalFetch = globalThis.fetch;

function setAllowedRateLimitStore() {
  __setRateLimitStoreForTests({
    execute: async (input: unknown) => {
      const sql = typeof input === "string" ? input : (input as { sql?: string }).sql ?? "";
      if (sql.includes("api_rate_limits")) {
        return { rows: [{ request_count: 1 }] };
      }

      return { rows: [] };
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
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));

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
  assert.deepEqual(calls, ["https://coin-images.coingecko.com/initial.png", "https://assets.coingecko.com/final.png"]);
  assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3]);
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
