import { and, eq } from "drizzle-orm";
import { db, dbClient } from "~~/lib/db";
import { watchedContent } from "~~/lib/db/schema";

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

export async function ensureWatchedContentTable() {
  // Schema is managed via Drizzle migrations.
}

export async function listWatchedContent(walletAddress: `0x${string}`): Promise<WatchedContentRecord[]> {
  await ensureWatchedContentTable();

  const result = await dbClient.execute({
    sql: `
      SELECT content_id, created_at
      FROM watched_content
      WHERE wallet_address = ?
      ORDER BY created_at DESC
    `,
    args: [walletAddress],
  });

  return result.rows.map(row => ({
    contentId: String(row.content_id),
    createdAt: new Date(String(row.created_at)).toISOString(),
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
