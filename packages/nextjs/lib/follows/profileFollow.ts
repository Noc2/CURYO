import { and, desc, eq } from "drizzle-orm";
import { db, dbClient } from "~~/lib/db";
import { profileFollows } from "~~/lib/db/schema";
import { createWatchlistTimestamp, isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export interface FollowedProfileRecord {
  walletAddress: string;
  createdAt: string;
}

export async function ensureProfileFollowsTable() {
  // Schema is managed via Drizzle migrations.
}

export async function listFollowedProfiles(followerAddress: `0x${string}`): Promise<FollowedProfileRecord[]> {
  await ensureProfileFollowsTable();

  const result = await dbClient.execute({
    sql: `
      SELECT target_address, created_at
      FROM profile_follows
      WHERE follower_address = ?
      ORDER BY created_at DESC
    `,
    args: [followerAddress],
  });

  return result.rows.map(row => ({
    walletAddress: normalizeWalletAddress(String(row.target_address)),
    createdAt: new Date(String(row.created_at)).toISOString(),
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
