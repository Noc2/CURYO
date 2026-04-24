import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;
const originalTargetNetworks = env.NEXT_PUBLIC_TARGET_NETWORKS;
const originalTrustedHeaders = env.RATE_LIMIT_TRUSTED_IP_HEADERS;

const TEST_ADDRESS = "0x63cada40E8AcF7A1d47229af5Be35b78b16035fa";
const TEST_IP = "203.0.113.77";

env.DATABASE_URL = "memory:";
env.NODE_ENV = "production";
env.NEXT_PUBLIC_TARGET_NETWORKS = "42220";
env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";

type RateLimitModule = typeof import("../../utils/rateLimit");
type FreeTransactionsModule = typeof import("../../lib/thirdweb/freeTransactions");
type WatchlistSessionRoute = typeof import("./watchlist/content/session/route");
type FollowsSessionRoute = typeof import("./follows/profiles/session/route");
type NotificationPreferencesSessionRoute = typeof import("./notifications/preferences/session/route");
type NotificationEmailSessionRoute = typeof import("./notifications/email/session/route");
type FreeTransactionSessionRoute = typeof import("./transactions/free/session/route");

let rateLimit: RateLimitModule;
let freeTransactions: FreeTransactionsModule;
let watchlistSessionRoute: WatchlistSessionRoute;
let followsSessionRoute: FollowsSessionRoute;
let notificationPreferencesSessionRoute: NotificationPreferencesSessionRoute;
let notificationEmailSessionRoute: NotificationEmailSessionRoute;
let freeTransactionSessionRoute: FreeTransactionSessionRoute;

function makeRequest(pathname: string) {
  return new NextRequest(`https://curyo.xyz${pathname}`, {
    headers: new Headers({
      "x-forwarded-for": TEST_IP,
    }),
  });
}

before(async () => {
  rateLimit = await import("../../utils/rateLimit");
  freeTransactions = await import("../../lib/thirdweb/freeTransactions");
  watchlistSessionRoute = await import("./watchlist/content/session/route");
  followsSessionRoute = await import("./follows/profiles/session/route");
  notificationPreferencesSessionRoute = await import("./notifications/preferences/session/route");
  notificationEmailSessionRoute = await import("./notifications/email/session/route");
  freeTransactionSessionRoute = await import("./transactions/free/session/route");
});

beforeEach(() => {
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.NEXT_PUBLIC_TARGET_NETWORKS = "42220";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";

  rateLimit.__setRateLimitStoreForTests({
    execute: async () => {
      throw new Error("database offline");
    },
  });
  freeTransactions.__setFreeTransactionTestOverridesForTests(null);
});

after(() => {
  rateLimit.__setRateLimitStoreForTests(null);
  freeTransactions.__setFreeTransactionTestOverridesForTests(null);

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

  if (originalTargetNetworks === undefined) {
    delete env.NEXT_PUBLIC_TARGET_NETWORKS;
  } else {
    env.NEXT_PUBLIC_TARGET_NETWORKS = originalTargetNetworks;
  }

  if (originalTrustedHeaders === undefined) {
    delete env.RATE_LIMIT_TRUSTED_IP_HEADERS;
  } else {
    env.RATE_LIMIT_TRUSTED_IP_HEADERS = originalTrustedHeaders;
  }
});

test("watchlist session route fails open when the rate limit store is unavailable", async () => {
  const response = await watchlistSessionRoute.GET(
    makeRequest(`/api/watchlist/content/session?address=${encodeURIComponent(TEST_ADDRESS)}`),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    hasSession: false,
    hasReadSession: false,
    hasWriteSession: false,
  });
});

test("profile follows session route fails open when the rate limit store is unavailable", async () => {
  const response = await followsSessionRoute.GET(
    makeRequest(`/api/follows/profiles/session?address=${encodeURIComponent(TEST_ADDRESS)}`),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    hasSession: false,
    hasReadSession: false,
    hasWriteSession: false,
  });
});

test("notification preferences session route fails open when the rate limit store is unavailable", async () => {
  const response = await notificationPreferencesSessionRoute.GET(
    makeRequest(`/api/notifications/preferences/session?address=${encodeURIComponent(TEST_ADDRESS)}`),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hasSession: false });
});

test("notification email session route fails open when the rate limit store is unavailable", async () => {
  const response = await notificationEmailSessionRoute.GET(
    makeRequest(`/api/notifications/email/session?address=${encodeURIComponent(TEST_ADDRESS)}`),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { hasSession: false });
});

test("free transaction session route keeps serving its fallback when the rate limit store is unavailable", async () => {
  freeTransactions.__setFreeTransactionTestOverridesForTests({
    resolveVoterIdTokenId: async () => null,
  });

  const response = await freeTransactionSessionRoute.GET(
    makeRequest(`/api/transactions/free/session?address=${encodeURIComponent(TEST_ADDRESS)}&chainId=42220`),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.chainId, 42220);
  assert.equal(body.environment, "production");
  assert.equal(body.verified, false);
  assert.equal(body.exhausted, false);
  assert.equal(body.remaining, 0);
  assert.equal(body.walletAddress, "0x63cada40E8AcF7A1d47229af5Be35b78b16035fa");
  assert.equal(body.voterIdTokenId, null);
});
