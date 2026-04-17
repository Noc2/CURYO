import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalTrustedHeaders = process.env.RATE_LIMIT_TRUSTED_IP_HEADERS;
const originalVercel = process.env.VERCEL;
const originalCuryoE2EProductionBuild = process.env.CURYO_E2E_PRODUCTION_BUILD;
const originalNextPublicCuryoE2EProductionBuild = process.env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD;

env.DATABASE_URL = "memory:";

type RateLimitModule = typeof import("./rateLimit");
type DbModule = typeof import("../lib/db");
type DbTestMemoryModule = typeof import("../lib/db/testMemory");

let rateLimit: RateLimitModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;

function makeRequest(
  pathname: string,
  method = "GET",
  headers: Record<string, string> = {},
  origin = "http://localhost",
) {
  return new NextRequest(`${origin}${pathname}`, {
    method,
    headers: new Headers(headers),
  });
}

before(async () => {
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  dbModule = await import("../lib/db");
  dbTestMemory = await import("../lib/db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  rateLimit = await import("./rateLimit");

  await rateLimit.checkRateLimit(
    makeRequest("/__rate_limit_init__", "GET", {
      "x-forwarded-for": "127.0.0.1",
    }),
    { limit: 10, windowMs: 60_000 },
  );
});

beforeEach(async () => {
  env.NODE_ENV = "production";
  delete env.RATE_LIMIT_TRUSTED_IP_HEADERS;
  delete env.VERCEL;
  delete env.CURYO_E2E_PRODUCTION_BUILD;
  delete env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD;
  rateLimit.__setRateLimitStoreForTests(null);
  await dbModule.dbClient.execute("DELETE FROM api_rate_limits");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limit_maintenance");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);

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

  if (originalVercel === undefined) {
    delete env.VERCEL;
  } else {
    env.VERCEL = originalVercel;
  }

  if (originalCuryoE2EProductionBuild === undefined) {
    delete env.CURYO_E2E_PRODUCTION_BUILD;
  } else {
    env.CURYO_E2E_PRODUCTION_BUILD = originalCuryoE2EProductionBuild;
  }

  if (originalNextPublicCuryoE2EProductionBuild === undefined) {
    delete env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD;
  } else {
    env.NEXT_PUBLIC_CURYO_E2E_PRODUCTION_BUILD = originalNextPublicCuryoE2EProductionBuild;
  }
});

test("resolveRateLimitSubject trusts configured proxy IP headers in production", () => {
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for, x-real-ip";

  const subject = rateLimit.resolveRateLimitSubject(
    makeRequest("/api/watchlist/content", "POST", {
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
      "user-agent": "test-agent",
    }),
  );

  assert.equal(subject, "ip:203.0.113.5");
});

test("resolveRateLimitSubject trusts Vercel x-real-ip by default", () => {
  env.VERCEL = "1";

  const subject = rateLimit.resolveRateLimitSubject(
    makeRequest("/api/watchlist/content", "POST", {
      "x-forwarded-for": "198.51.100.44, 10.0.0.1",
      "x-real-ip": "198.51.100.44",
      "user-agent": "test-agent",
    }),
  );

  assert.equal(subject, "ip:198.51.100.44");
});

test("resolveRateLimitSubject falls back to a request fingerprint when no trusted IP is available", () => {
  const subject = rateLimit.resolveRateLimitSubject(
    makeRequest(
      "/api/watchlist/content",
      "POST",
      {
        "user-agent": "test-agent",
        "accept-language": "en-US",
        cookie: "session=abc123",
      },
      "https://curyo.xyz",
    ),
    { extraKeyParts: ["0xAbC", "watch"] },
  );

  assert.match(subject, /^fingerprint:/);
  assert.match(subject, /\|0xabc\|watch$/);
});

test("checkRateLimit fails closed in production when no trusted client IP can be derived", async () => {
  const response = await rateLimit.checkRateLimit(
    makeRequest(
      "/api/watchlist/content",
      "GET",
      {
        "user-agent": "test-agent",
        "accept-language": "en-US",
      },
      "https://curyo.xyz",
    ),
    { limit: 10, windowMs: 60_000 },
  );

  assert.equal(response?.status, 503);
  assert.deepEqual(await response?.json(), { error: "Rate limiting is misconfigured" });
});

test("checkRateLimit fails closed for localhost production requests without explicit local-e2e mode", async () => {
  const response = await rateLimit.checkRateLimit(
    makeRequest("/api/watchlist/content", "GET", {
      "user-agent": "test-agent",
      "accept-language": "en-US",
    }),
    { limit: 10, windowMs: 60_000 },
  );

  assert.equal(response?.status, 503);
  assert.deepEqual(await response?.json(), { error: "Rate limiting is misconfigured" });
});

test("checkRateLimit accepts localhost production requests in explicit local-e2e mode", async () => {
  env.CURYO_E2E_PRODUCTION_BUILD = "true";

  const response = await rateLimit.checkRateLimit(
    makeRequest("/api/watchlist/content", "GET", {
      "user-agent": "test-agent",
      "accept-language": "en-US",
    }),
    { limit: 10, windowMs: 60_000 },
  );

  assert.equal(response, null);
});

test("checkRateLimit accepts Vercel x-real-ip headers without extra env config", async () => {
  env.VERCEL = "1";

  const response = await rateLimit.checkRateLimit(
    makeRequest("/api/watchlist/content", "GET", {
      "x-forwarded-for": "203.0.113.99, 10.0.0.1",
      "x-real-ip": "203.0.113.99",
      "user-agent": "test-agent",
    }),
    { limit: 10, windowMs: 60_000 },
  );

  assert.equal(response, null);
});

test("resolveRateLimitSubject uses x-forwarded-for automatically in development", () => {
  env.NODE_ENV = "development";

  const subject = rateLimit.resolveRateLimitSubject(
    makeRequest("/api/watchlist/content", "POST", {
      "x-forwarded-for": "198.51.100.10, 10.0.0.2",
    }),
  );

  assert.equal(subject, "ip:198.51.100.10");
});

test("checkRateLimit scopes counters by HTTP method on the same path", async () => {
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  const headers = { "x-forwarded-for": "203.0.113.12" };

  const getRequest = makeRequest("/api/watchlist/content", "GET", headers);
  const postRequest = makeRequest("/api/watchlist/content", "POST", headers);
  const config = { limit: 1, windowMs: 60_000 };

  assert.equal(await rateLimit.checkRateLimit(getRequest, config), null);
  assert.equal(await rateLimit.checkRateLimit(postRequest, config), null);

  const limited = await rateLimit.checkRateLimit(getRequest, config);
  assert.equal(limited?.status, 429);
});

test("checkRateLimit fails closed when the backing store is unavailable in production", async () => {
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  rateLimit.__setRateLimitStoreForTests({
    execute: async () => {
      throw new Error("database offline");
    },
  });

  const response = await rateLimit.checkRateLimit(
    makeRequest("/api/thumbnails", "POST", {
      "x-forwarded-for": "203.0.113.77",
    }),
    { limit: 1, windowMs: 60_000 },
  );

  assert.equal(response?.status, 503);
  assert.deepEqual(await response?.json(), { error: "Rate limiting is unavailable" });
});

test("checkRateLimit can fail open for opted-in endpoints when the backing store is unavailable", async () => {
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  rateLimit.__setRateLimitStoreForTests({
    execute: async () => {
      throw new Error("database offline");
    },
  });

  const response = await rateLimit.checkRateLimit(
    makeRequest("/api/thumbnails", "POST", {
      "x-forwarded-for": "203.0.113.77",
    }),
    { limit: 1, windowMs: 60_000 },
    { allowOnStoreUnavailable: true },
  );

  assert.equal(response, null);
});
