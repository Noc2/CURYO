import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";

const tempDir = mkdtempSync(join(tmpdir(), "curyo-watchlist-"));
const dbPath = join(tempDir, "watchlist.db");

process.env.DATABASE_URL = `file:${dbPath}`;

type ContentWatchModule = typeof import("./contentWatch");
type DbModule = typeof import("../db");

let contentWatch: ContentWatchModule;
let dbModule: DbModule;

const WALLET = "0x1234567890abcdef1234567890abcdef12345678" as const;

before(async () => {
  contentWatch = await import("./contentWatch");
  dbModule = await import("../db");
  await contentWatch.ensureWatchedContentTable();
});

beforeEach(async () => {
  await dbModule.dbClient.execute("DELETE FROM watched_content");
});

after(() => {
  rmSync(tempDir, { recursive: true, force: true });
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

test("listWatchedContent normalizes legacy millisecond timestamps on read", async () => {
  const legacyMs = 1_725_000_123_987;
  await dbModule.dbClient.execute({
    sql: `
      INSERT INTO watched_content (wallet_address, content_id, created_at)
      VALUES (?, ?, ?)
    `,
    args: [WALLET, "1", legacyMs],
  });

  const [item] = await contentWatch.listWatchedContent(WALLET);
  assert.ok(item, "legacy row should be readable");
  assert.equal(new Date(item.createdAt).getTime(), legacyMs);
});

test("repairWatchedContentTimestamps fixes mixed-row ordering", async () => {
  const olderLegacyMs = Date.now() - 2 * 24 * 60 * 60 * 1000;
  const newerSeconds = Math.floor(Date.now() / 1000);

  await dbModule.dbClient.execute({
    sql: `
      INSERT INTO watched_content (wallet_address, content_id, created_at)
      VALUES (?, ?, ?), (?, ?, ?)
    `,
    args: [WALLET, "old-legacy", olderLegacyMs, WALLET, "new-seconds", newerSeconds],
  });

  const beforeRepair = await contentWatch.listWatchedContent(WALLET);
  assert.equal(beforeRepair[0]?.contentId, "old-legacy");

  await contentWatch.repairWatchedContentTimestamps();

  const afterRepair = await contentWatch.listWatchedContent(WALLET);
  assert.equal(afterRepair[0]?.contentId, "new-seconds");
  assert.equal(
    new Date(afterRepair[1]!.createdAt).getTime(),
    contentWatch.createWatchlistTimestamp(olderLegacyMs).getTime(),
  );
});
