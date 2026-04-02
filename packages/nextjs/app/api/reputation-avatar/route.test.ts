import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;
const originalTrustedHeaders = env.RATE_LIMIT_TRUSTED_IP_HEADERS;
const originalTargetNetworks = env.NEXT_PUBLIC_TARGET_NETWORKS;

const TEST_ADDRESS = "0xc1CD80C7cD37b5499560C362b164cbA1CfF71b44";

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
  env.NEXT_PUBLIC_TARGET_NETWORKS = "42220";

  rateLimit = await import("~~/utils/rateLimit");
  route = await import("./route");
});

beforeEach(() => {
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";
  env.NEXT_PUBLIC_TARGET_NETWORKS = "42220";

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

  if (originalTargetNetworks === undefined) {
    delete env.NEXT_PUBLIC_TARGET_NETWORKS;
  } else {
    env.NEXT_PUBLIC_TARGET_NETWORKS = originalTargetNetworks;
  }
});

test("reputation avatar route rejects unsupported chain ids", async () => {
  const response = await route.GET(
    makeRequest(`/api/reputation-avatar?address=${encodeURIComponent(TEST_ADDRESS)}&chainId=31337`),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: "Unsupported chainId",
  });
});
