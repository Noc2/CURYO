import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;
const originalTrustedHeaders = env.RATE_LIMIT_TRUSTED_IP_HEADERS;

type RateLimitModule = typeof import("~~/utils/rateLimit");
type RouteModule = typeof import("./route");

let capturedLogs: unknown[][] = [];
let originalInfo: typeof console.info;
let originalWarn: typeof console.warn;
let rateLimit: RateLimitModule;
let route: RouteModule;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("https://curyo.xyz/api/governance/self-verification/telemetry", {
    body: JSON.stringify(body),
    headers: new Headers({
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.88",
    }),
    method: "POST",
  });
}

before(async () => {
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";

  originalInfo = console.info;
  originalWarn = console.warn;
  console.info = (...args: unknown[]) => {
    capturedLogs.push(args);
  };
  console.warn = (...args: unknown[]) => {
    capturedLogs.push(args);
  };

  rateLimit = await import("~~/utils/rateLimit");
  route = await import("./route");
});

beforeEach(() => {
  capturedLogs = [];
  rateLimit.__setRateLimitStoreForTests({
    execute: async () => {
      throw new Error("database offline");
    },
  });
});

after(() => {
  rateLimit.__setRateLimitStoreForTests(null);
  console.info = originalInfo;
  console.warn = originalWarn;

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

test("self telemetry route logs sanitized operational events", async () => {
  const response = await route.POST(
    makeRequest({
      attemptId: "attempt-1",
      contractAddress: "0xABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD",
      event: "self_verification_failed",
      errorMessage: "Proof failed",
      signature: "0xshould-not-be-logged",
      userDefinedData: "0xshould-not-be-logged",
      walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(capturedLogs.length, 2);
  assert.equal(capturedLogs[1][0], "[self-verification] event");

  const loggedPayload = capturedLogs[1][1] as Record<string, unknown>;
  assert.equal(loggedPayload.event, "self_verification_failed");
  assert.equal(loggedPayload.walletAddress, "0x1234567890abcdef1234567890abcdef12345678");
  assert.equal(loggedPayload.signature, undefined);
  assert.equal(loggedPayload.userDefinedData, undefined);
});

test("self telemetry route rejects invalid events", async () => {
  const response = await route.POST(
    makeRequest({
      event: "document_details",
    }),
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Invalid telemetry event." });
});
