import { NextRequest } from "next/server";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalDatabaseUrl = env.DATABASE_URL;
const originalNodeEnv = env.NODE_ENV;

env.DATABASE_URL = "memory:";

type RouteModule = typeof import("./route");
type DbModule = typeof import("../../../../lib/db");
type DbTestMemoryModule = typeof import("../../../../lib/db/testMemory");

let route: RouteModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;

function restoreEnv(name: keyof NodeJS.ProcessEnv, value: string | undefined) {
  if (value === undefined) {
    delete env[name];
  } else {
    env[name] = value;
  }
}

function makePayload(clientRequestId: string) {
  return {
    bounty: {
      amount: "1000000",
      asset: "USDC",
      rewardPoolExpiresAt: "1762000000",
    },
    chainId: 42220,
    clientRequestId,
    question: {
      categoryId: "5",
      contextUrl: "https://example.com/context",
      description: "Would this make you want to learn more?",
      tags: ["agents", "pitch"],
      title: "Pitch interest",
    },
  };
}

function makePost(body: unknown) {
  return new NextRequest("http://localhost/api/x402/questions", {
    body: JSON.stringify(body),
    headers: new Headers({
      "content-type": "application/json",
    }),
    method: "POST",
  });
}

before(async () => {
  env.NODE_ENV = "development";
  dbModule = await import("../../../../lib/db");
  dbTestMemory = await import("../../../../lib/db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  route = await import("./route");
});

beforeEach(async () => {
  env.NODE_ENV = "development";
  await dbModule.dbClient.execute("DELETE FROM api_rate_limits");
  await dbModule.dbClient.execute("DELETE FROM api_rate_limit_maintenance");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
  restoreEnv("DATABASE_URL", originalDatabaseUrl);
  restoreEnv("NODE_ENV", originalNodeEnv);
});

test("POST fails closed before hosted x402 settlement can receive bounty funds", async () => {
  const response = await route.POST(makePost(makePayload("route-x402-disabled")));
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 410);
  assert.match(String(body.error), /operator executor wallet/i);
});
