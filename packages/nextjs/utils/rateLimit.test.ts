import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "curyo-rate-limit-"));
const dbPath = join(tempDir, "rate-limit.db");
const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalTrustedHeaders = process.env.RATE_LIMIT_TRUSTED_IP_HEADERS;

env.DATABASE_URL = `file:${dbPath}`;

type RateLimitModule = typeof import("./rateLimit");
type DbModule = typeof import("../lib/db");

let rateLimit: RateLimitModule;
let dbModule: DbModule;

function makeRequest(pathname: string, method = "GET", headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${pathname}`, {
    method,
    headers: new Headers(headers),
  });
}

before(async () => {
  env.NODE_ENV = "production";
  rateLimit = await import("./rateLimit");
  dbModule = await import("../lib/db");

  await rateLimit.checkRateLimit(makeRequest("/__rate_limit_init__"), { limit: 10, windowMs: 60_000 });
});

beforeEach(async () => {
  env.NODE_ENV = "production";
  delete env.RATE_LIMIT_TRUSTED_IP_HEADERS;
  await dbModule.dbClient.execute("DELETE FROM api_rate_limits");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limit_maintenance");
});

after(() => {
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

  rmSync(tempDir, { recursive: true, force: true });
});

test("resolveRateLimitSubject trusts configured proxy IP headers in production", () => {
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for, x-real-ip";

  const subject = rateLimit.resolveRateLimitSubject(
    makeRequest("/api/comments", "POST", {
      "x-forwarded-for": "203.0.113.5, 10.0.0.1",
      "user-agent": "test-agent",
    }),
  );

  assert.equal(subject, "ip:203.0.113.5");
});

test("resolveRateLimitSubject falls back to a request fingerprint when no trusted IP is available", () => {
  const subject = rateLimit.resolveRateLimitSubject(
    makeRequest("/api/watchlist/content", "POST", {
      "user-agent": "test-agent",
      "accept-language": "en-US",
      cookie: "session=abc123",
    }),
    { extraKeyParts: ["0xAbC", "watch"] },
  );

  assert.match(subject, /^fingerprint:/);
  assert.match(subject, /\|0xabc\|watch$/);
});

test("checkRateLimit fails closed in production when no trusted client IP can be derived", async () => {
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

test("resolveRateLimitSubject uses x-forwarded-for automatically in development", () => {
  env.NODE_ENV = "development";

  const subject = rateLimit.resolveRateLimitSubject(
    makeRequest("/api/comments", "POST", {
      "x-forwarded-for": "198.51.100.10, 10.0.0.2",
    }),
  );

  assert.equal(subject, "ip:198.51.100.10");
});

test("checkRateLimit scopes counters by HTTP method on the same path", async () => {
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  const headers = { "x-forwarded-for": "203.0.113.12" };

  const getRequest = makeRequest("/api/comments", "GET", headers);
  const postRequest = makeRequest("/api/comments", "POST", headers);
  const config = { limit: 1, windowMs: 60_000 };

  assert.equal(await rateLimit.checkRateLimit(getRequest, config), null);
  assert.equal(await rateLimit.checkRateLimit(postRequest, config), null);

  const limited = await rateLimit.checkRateLimit(getRequest, config);
  assert.equal(limited?.status, 429);
});
