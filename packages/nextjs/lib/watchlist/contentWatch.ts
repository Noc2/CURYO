import { and, desc, eq } from "drizzle-orm";
import { db, dbClient } from "~~/lib/db";
import { watchedContent } from "~~/lib/db/schema";

let ensureWatchedContentTablePromise: Promise<void> | null = null;
const LEGACY_MILLISECONDS_THRESHOLD = 9_999_999_999;
const MAX_REASONABLE_TIMESTAMP_MS = Date.UTC(2100, 0, 1);

export interface WatchedContentRecord {
  contentId: string;
  createdAt: string;
}

export function isValidWalletAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function normalizeWalletAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

export function normalizeContentId(value: unknown): string | null {
  const raw =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number" || typeof value === "bigint"
        ? String(value)
        : null;

  if (!raw || !/^\d+$/.test(raw)) {
    return null;
  }

  const normalized = raw.replace(/^0+(?=\d)/, "");
  return normalized === "0" ? null : normalized;
}

export function createWatchlistTimestamp(nowMs = Date.now()): Date {
  return new Date(Math.floor(nowMs / 1000) * 1000);
}

export function normalizeWatchedContentCreatedAt(value: Date | number | string): Date {
  if (value instanceof Date) {
    const time = value.getTime();
    if (!Number.isFinite(time)) {
      return new Date(0);
    }
    if (time > MAX_REASONABLE_TIMESTAMP_MS) {
      return new Date(Math.floor(time / 1000));
    }
    return value;
  }

  if (typeof value === "number") {
    return new Date(value > LEGACY_MILLISECONDS_THRESHOLD ? value : value * 1000);
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return normalizeWatchedContentCreatedAt(numeric);
  }

  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    return new Date(0);
  }
  return normalizeWatchedContentCreatedAt(parsed);
}

export async function repairWatchedContentTimestamps(): Promise<void> {
  await dbClient.execute(`
    UPDATE watched_content
    SET created_at = created_at / 1000
    WHERE created_at > ${LEGACY_MILLISECONDS_THRESHOLD}
  `);
}

export async function ensureWatchedContentTable() {
  if (!ensureWatchedContentTablePromise) {
    ensureWatchedContentTablePromise = (async () => {
      await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS watched_content (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          wallet_address TEXT NOT NULL,
          content_id TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      await dbClient.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS watched_content_wallet_content_unique
        ON watched_content (wallet_address, content_id)
      `);
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS watched_content_wallet_created_at_idx
        ON watched_content (wallet_address, created_at DESC)
      `);
      await repairWatchedContentTimestamps();
    })();
  }

  await ensureWatchedContentTablePromise;
}

export async function listWatchedContent(walletAddress: `0x${string}`): Promise<WatchedContentRecord[]> {
  await ensureWatchedContentTable();

  const rows = await db
    .select({
      contentId: watchedContent.contentId,
      createdAt: watchedContent.createdAt,
    })
    .from(watchedContent)
    .where(eq(watchedContent.walletAddress, walletAddress))
    .orderBy(desc(watchedContent.createdAt));

  return rows.map(row => ({
    contentId: row.contentId,
    createdAt: normalizeWatchedContentCreatedAt(row.createdAt).toISOString(),
  }));
}

export async function addWatchedContent(walletAddress: `0x${string}`, contentId: string): Promise<void> {
  await ensureWatchedContentTable();
  await db
    .insert(watchedContent)
    .values({
      walletAddress,
      contentId,
      createdAt: createWatchlistTimestamp(),
    })
    .onConflictDoNothing();
}

export async function removeWatchedContent(walletAddress: `0x${string}`, contentId: string): Promise<void> {
  await ensureWatchedContentTable();

  await db
    .delete(watchedContent)
    .where(and(eq(watchedContent.walletAddress, walletAddress), eq(watchedContent.contentId, contentId)));
}
