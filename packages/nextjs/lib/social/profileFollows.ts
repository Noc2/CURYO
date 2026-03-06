import { and, desc, eq } from "drizzle-orm";
import { db, dbClient } from "~~/lib/db";
import { followedProfiles } from "~~/lib/db/schema";

let ensureFollowedProfilesTablePromise: Promise<void> | null = null;

export interface FollowedProfileRecord {
  walletAddress: string;
  createdAt: string;
}

export function isValidWalletAddress(address: string): address is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

export function normalizeWalletAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

export async function ensureFollowedProfilesTable() {
  if (!ensureFollowedProfilesTablePromise) {
    ensureFollowedProfilesTablePromise = (async () => {
      await dbClient.execute(`
        CREATE TABLE IF NOT EXISTS followed_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
          follower_wallet_address TEXT NOT NULL,
          followed_wallet_address TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      await dbClient.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS followed_profiles_follower_followed_unique
        ON followed_profiles (follower_wallet_address, followed_wallet_address)
      `);
      await dbClient.execute(`
        CREATE INDEX IF NOT EXISTS followed_profiles_follower_created_at_idx
        ON followed_profiles (follower_wallet_address, created_at DESC)
      `);
    })();
  }

  await ensureFollowedProfilesTablePromise;
}

export async function listFollowedProfiles(followerWalletAddress: `0x${string}`): Promise<FollowedProfileRecord[]> {
  await ensureFollowedProfilesTable();

  const rows = await db
    .select({
      walletAddress: followedProfiles.followedWalletAddress,
      createdAt: followedProfiles.createdAt,
    })
    .from(followedProfiles)
    .where(eq(followedProfiles.followerWalletAddress, followerWalletAddress))
    .orderBy(desc(followedProfiles.createdAt));

  return rows.map(row => ({
    walletAddress: row.walletAddress,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function addFollowedProfile(
  followerWalletAddress: `0x${string}`,
  followedWalletAddress: `0x${string}`,
): Promise<void> {
  await ensureFollowedProfilesTable();

  await dbClient.execute({
    sql: `
      INSERT OR IGNORE INTO followed_profiles (follower_wallet_address, followed_wallet_address, created_at)
      VALUES (?, ?, ?)
    `,
    args: [followerWalletAddress, followedWalletAddress, Date.now()],
  });
}

export async function removeFollowedProfile(
  followerWalletAddress: `0x${string}`,
  followedWalletAddress: `0x${string}`,
): Promise<void> {
  await ensureFollowedProfilesTable();

  await db
    .delete(followedProfiles)
    .where(
      and(
        eq(followedProfiles.followerWalletAddress, followerWalletAddress),
        eq(followedProfiles.followedWalletAddress, followedWalletAddress),
      ),
    );
}
