import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;
const originalTrustedHeaders = env.RATE_LIMIT_TRUSTED_IP_HEADERS;
const originalPonderUrl = env.NEXT_PUBLIC_PONDER_URL;

const TEST_FRONTEND = "0x63cada40E8AcF7A1d47229af5Be35b78b16035fa";

type RateLimitModule = typeof import("~~/utils/rateLimit");
type RouteModule = typeof import("./route");

let rateLimit: RateLimitModule;
let route: RouteModule;

function makeRequest(pathname: string): NextRequest {
  return new NextRequest(`https://curyo.xyz${pathname}`, {
    headers: new Headers({
      "x-forwarded-for": "203.0.113.77",
    }),
  });
}

before(async () => {
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  env.NEXT_PUBLIC_PONDER_URL = "";

  rateLimit = await import("~~/utils/rateLimit");
  route = await import("./route");
});

beforeEach(() => {
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  env.NEXT_PUBLIC_PONDER_URL = "";

  rateLimit.__setRateLimitStoreForTests({
    execute: async () => {
      throw new Error("database offline");
    },
  });
});

after(() => {
  rateLimit.__setRateLimitStoreForTests(null);

  if (originalDatabaseUrl === undefined) {
    delete env.DATABASE_URL;
  } else {
    env.DATABASE_URL = originalDatabaseUrl;
  }

  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }

  if (originalTrustedHeaders === undefined) {
    delete env.RATE_LIMIT_TRUSTED_IP_HEADERS;
  } else {
    env.RATE_LIMIT_TRUSTED_IP_HEADERS = originalTrustedHeaders;
  }

  if (originalPonderUrl === undefined) {
    delete env.NEXT_PUBLIC_PONDER_URL;
  } else {
    env.NEXT_PUBLIC_PONDER_URL = originalPonderUrl;
  }
});

test("frontend claimable fees route fails open when the rate limit store is unavailable", async () => {
  const response = await route.GET(
    makeRequest(`/api/frontend/claimable-fees?frontend=${encodeURIComponent(TEST_FRONTEND)}&limit=10&offset=0`),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    items: [],
    hasMore: false,
    nextOffset: 0,
    scannedRounds: 0,
    totalRounds: 0,
  });
});
