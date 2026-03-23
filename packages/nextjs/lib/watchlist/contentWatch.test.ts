import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

process.env.DATABASE_URL = "memory:";

type ContentWatchModule = typeof import("./contentWatch");
type DbModule = typeof import("../db");
type DbTestMemoryModule = typeof import("../db/testMemory");

let contentWatch: ContentWatchModule;
let dbModule: DbModule;
let dbTestMemory: DbTestMemoryModule;

const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;

before(async () => {
  dbModule = await import("../db");
  dbTestMemory = await import("../db/testMemory");
  dbModule.__setDatabaseResourcesForTests(dbTestMemory.createMemoryDatabaseResources());
  contentWatch = await import("./contentWatch");
  await contentWatch.ensureWatchedContentTable();
});

beforeEach(async () => {
  await dbModule.dbClient.execute("DELETE FROM watched_content");
});

after(() => {
  dbModule.__setDatabaseResourcesForTests(null);
});

test("createWatchlistTimestamp truncates to whole seconds", () => {
  const timestamp = contentWatch.createWatchlistTimestamp(1_725_000_123_987);
  assert.equal(timestamp.getTime(), 1_725_000_123_000);
});

test("addWatchedContent stores sane timestamps", async () => {
  await contentWatch.addWatchedContent(WALLET, "1");

  const [item] = await contentWatch.listWatchedContent(WALLET);
  assert.ok(item, "watchlist row should exist");

  const createdAt = new Date(item.createdAt);
  assert.equal(createdAt.getMilliseconds(), 0);
  assert.ok(createdAt.getFullYear() < 2100);
  assert.ok(Math.abs(createdAt.getTime() - Date.now()) < 10_000);
});
