import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalAppEnv = env.APP_ENV;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;
const originalTrustedHeaders = env.RATE_LIMIT_TRUSTED_IP_HEADERS;

const TEST_ADDRESS = "0x63cada40E8AcF7A1d47229af5Be35b78b16035fa";
const TEST_IP = "203.0.113.77";
const TEST_OPERATION_KEY = `0x${"1".repeat(64)}`;
const TEST_TX_HASH = `0x${"2".repeat(64)}`;

type DbModule = typeof import("~~/lib/db");
type DbTestMemoryModule = typeof import("~~/lib/db/testMemory");
type RateLimitModule = typeof import("~~/utils/rateLimit");
type FreeTransactionsModule = typeof import("~~/lib/thirdweb/freeTransactions");
type RouteModule = typeof import("./route");
type DatabaseResources = import("~~/lib/db").DatabaseResources;

let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;
let rateLimit: RateLimitModule;
let freeTransactions: FreeTransactionsModule;
let route: RouteModule;
let memoryResources: DatabaseResources;

function createStoreUnavailableResources(base: DatabaseResources): DatabaseResources {
  const storeUnavailableError = new Error("database offline", {
    cause: {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    },
  });
  const database = new Proxy(base.database as object, {
    get(target, property, receiver) {
      if (property === "insert" || property === "transaction") {
        return () => {
          throw storeUnavailableError;
        };
      }

      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DatabaseResources["database"];

  return {
    client: base.client,
    database,
    pool: base.pool,
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("https://curyo.xyz/api/transactions/free/confirm", {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      "x-forwarded-for": TEST_IP,
    }),
    body: JSON.stringify(body),
  });
}

before(async () => {
  env.APP_ENV = "production";
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";

  dbModule = await import("~~/lib/db");
  dbTestMemory = await import("~~/lib/db/testMemory");
  rateLimit = await import("~~/utils/rateLimit");
  freeTransactions = await import("~~/lib/thirdweb/freeTransactions");
  route = await import("./route");

  memoryResources = dbTestMemory.createMemoryDatabaseResources();
});

beforeEach(async () => {
  env.APP_ENV = "production";
  env.DATABASE_URL = "memory:";
  env.NODE_ENV = "production";
  env.RATE_LIMIT_TRUSTED_IP_HEADERS = "x-forwarded-for";

  dbModule.__setDatabaseResourcesForTests(memoryResources);
  rateLimit.__setRateLimitStoreForTests({
    execute: async () => {
      throw new Error("database offline");
    },
  });
  freeTransactions.__setFreeTransactionTestOverridesForTests({
    allTransactionHashesSucceeded: async () => true,
  });

  await dbModule.dbClient.execute("DELETE FROM free_transaction_reservations");
  await dbModule.dbClient.execute("DELETE FROM free_transaction_quotas");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
  rateLimit.__setRateLimitStoreForTests(null);
  freeTransactions.__setFreeTransactionTestOverridesForTests(null);

  if (originalAppEnv === undefined) {
    delete env.APP_ENV;
  } else {
    env.APP_ENV = originalAppEnv;
  }

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

test("free transaction confirm route fails open when the rate limit store is unavailable", async () => {
  const response = await route.POST(
    makeRequest({
      address: TEST_ADDRESS,
      chainId: 42220,
      operationKey: TEST_OPERATION_KEY,
      transactionHashes: [TEST_TX_HASH],
    }),
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("free transaction confirm route fails open when the quota store is unavailable", async () => {
  dbModule.__setDatabaseResourcesForTests(createStoreUnavailableResources(memoryResources));

  try {
    const response = await route.POST(
      makeRequest({
        address: TEST_ADDRESS,
        chainId: 42220,
        operationKey: TEST_OPERATION_KEY,
        transactionHashes: [TEST_TX_HASH],
      }),
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    dbModule.__setDatabaseResourcesForTests(memoryResources);
  }
});
