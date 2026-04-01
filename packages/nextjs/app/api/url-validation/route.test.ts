import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalNodeEnv = process.env.NODE_ENV;
const originalTrustedHeaders = process.env.RATE_LIMIT_TRUSTED_IP_HEADERS;

type RateLimitModule = typeof import("~~/utils/rateLimit");
type RouteModule = typeof import("./route");

let rateLimit: RateLimitModule;
let route: RouteModule;

function makeRequest(
  pathname: string,
  options: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  } = {},
): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, {
    method: options.method,
    body: options.body,
    headers: new Headers(options.headers),
  });
}

before(async () => {
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";

  rateLimit = await import("~~/utils/rateLimit");
  route = await import("./route");
});

beforeEach(() => {
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
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
});

test("GET keeps serving cached URL validation responses when the rate-limit store is unavailable", async () => {
  const response = await route.GET(
    makeRequest("/api/url-validation?urls=https://example.com", {
      headers: {
        "x-forwarded-for": "203.0.113.77",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    results: {
      "https://example.com": null,
    },
  });
});

test("POST keeps serving URL validation responses when the rate-limit store is unavailable", async () => {
  const response = await route.POST(
    makeRequest("/api/url-validation", {
      method: "POST",
      body: JSON.stringify({
        urls: ["https://example.com"],
      }),
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.77",
      },
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { results: {} });
});
