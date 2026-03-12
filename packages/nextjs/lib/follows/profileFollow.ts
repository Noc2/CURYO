import { and, desc, eq } from "drizzle-orm";
import { db, dbClient } from "~~/lib/db";
import { profileFollows } from "~~/lib/db/schema";
import { createWatchlistTimestamp, isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

let ensureProfileFollowsTablePromise: Promise<void> | null = null;

export interface FollowedProfileRecord {
  walletAddress: string;
  createdAt: string;
}

export async function ensureProfileFollowsTable() {
  if (!ensureProfileFollowsTablePromise) {
    ensureProfileFollowsTablePromise = (async () => {
      await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS profile_follows (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          follower_address TEXT NOT NULL,
          target_address TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      await dbClient.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS profile_follows_follower_target_unique
        ON profile_follows (follower_address, target_address)
      `);
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS profile_follows_follower_created_at_idx
        ON profile_follows (follower_address, created_at DESC)
      `);
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS profile_follows_target_created_at_idx
        ON profile_follows (target_address, created_at DESC)
      `);
    })();
  }

  await ensureProfileFollowsTablePromise;
}

export async function listFollowedProfiles(followerAddress: `0x${string}`): Promise<FollowedProfileRecord[]> {
  await ensureProfileFollowsTable();

  const rows = await db
    .select({
      walletAddress: profileFollows.targetAddress,
      createdAt: profileFollows.createdAt,
    })
    .from(profileFollows)
    .where(eq(profileFollows.followerAddress, followerAddress))
    .orderBy(desc(profileFollows.createdAt));

  return rows.map(row => ({
    walletAddress: normalizeWalletAddress(row.walletAddress),
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getFollowedWalletAddresses(followerAddress: `0x${string}`): Promise<`0x${string}`[]> {
  await ensureProfileFollowsTable();

  const rows = await db
    .select({ walletAddress: profileFollows.targetAddress })
    .from(profileFollows)
    .where(eq(profileFollows.followerAddress, followerAddress))
    .orderBy(desc(profileFollows.createdAt));

  return rows.map(row => normalizeWalletAddress(row.walletAddress));
}

export async function addFollowedProfile(followerAddress: `0x${string}`, targetAddress: `0x${string}`): Promise<void> {
  await ensureProfileFollowsTable();
  await db
    .insert(profileFollows)
    .values({
      followerAddress,
      targetAddress,
      createdAt: createWatchlistTimestamp(),
    })
    .onConflictDoNothing();
}

export async function removeFollowedProfile(
  followerAddress: `0x${string}`,
  targetAddress: `0x${string}`,
): Promise<void> {
  await ensureProfileFollowsTable();

  await db
    .delete(profileFollows)
    .where(and(eq(profileFollows.followerAddress, followerAddress), eq(profileFollows.targetAddress, targetAddress)));
}

export { isValidWalletAddress, normalizeWalletAddress };
