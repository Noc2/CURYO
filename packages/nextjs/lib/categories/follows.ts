import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "~~/lib/db";
import { followedCategories } from "~~/lib/db/schema";

let ensureFollowedCategoriesTablePromise: Promise<void> | null = null;

export function normalizeCategoryId(categoryId: string | number | bigint) {
  return categoryId.toString();
}

export async function ensureFollowedCategoriesTable() {
  if (!ensureFollowedCategoriesTablePromise) {
    ensureFollowedCategoriesTablePromise = (async () => {
      await db.run(
        sql.raw(`
          CREATE TABLE IF NOT EXISTS followed_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            category_id TEXT NOT NULL,
            created_at INTEGER NOT NULL
          )
        `),
      );
      await db.run(
        sql.raw(`
          CREATE UNIQUE INDEX IF NOT EXISTS followed_categories_wallet_category_unique
          ON followed_categories (wallet_address, category_id)
        `),
      );
    })();
  }

  await ensureFollowedCategoriesTablePromise;
}

export async function listFollowedCategories(walletAddress: `0x${string}`) {
  await ensureFollowedCategoriesTable();

  return db
    .select({
      categoryId: followedCategories.categoryId,
      createdAt: followedCategories.createdAt,
    })
    .from(followedCategories)
    .where(eq(followedCategories.walletAddress, walletAddress))
    .orderBy(desc(followedCategories.createdAt));
}

export async function addFollowedCategory(walletAddress: `0x${string}`, categoryId: string) {
  await ensureFollowedCategoriesTable();

  await db
    .insert(followedCategories)
    .values({
      walletAddress,
      categoryId: normalizeCategoryId(categoryId),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

export async function removeFollowedCategory(walletAddress: `0x${string}`, categoryId: string) {
  await ensureFollowedCategoriesTable();

  await db
    .delete(followedCategories)
    .where(
      and(
        eq(followedCategories.walletAddress, walletAddress),
        eq(followedCategories.categoryId, normalizeCategoryId(categoryId)),
      ),
    );
}
