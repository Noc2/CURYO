import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const userProfiles = sqliteTable("user_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  walletAddress: text("wallet_address").notNull().unique(), // lowercase address
  username: text("username").notNull().unique(), // 3-20 alphanumeric chars
  profileImageUrl: text("profile_image_url"), // optional external image URL
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type NewUserProfile = typeof userProfiles.$inferInsert;

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contentId: text("content_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export const watchedContent = sqliteTable(
  "watched_content",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walletAddress: text("wallet_address").notNull(),
    contentId: text("content_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    walletContentUnique: uniqueIndex("watched_content_wallet_content_unique").on(table.walletAddress, table.contentId),
  }),
);

export type WatchedContent = typeof watchedContent.$inferSelect;
export type NewWatchedContent = typeof watchedContent.$inferInsert;

export const followedProfiles = sqliteTable(
  "followed_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    followerWalletAddress: text("follower_wallet_address").notNull(),
    followedWalletAddress: text("followed_wallet_address").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    followerFollowedUnique: uniqueIndex("followed_profiles_follower_followed_unique").on(
      table.followerWalletAddress,
      table.followedWalletAddress,
    ),
  }),
);

export type FollowedProfile = typeof followedProfiles.$inferSelect;
export type NewFollowedProfile = typeof followedProfiles.$inferInsert;

export const urlValidations = sqliteTable("url_validations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  isValid: integer("is_valid", { mode: "boolean" }).notNull(),
  platform: text("platform").notNull(), // "youtube", "wikipedia", "generic", etc.
  checkedAt: integer("checked_at", { mode: "timestamp" }).notNull(),
});

export type UrlValidation = typeof urlValidations.$inferSelect;

export const contentMetadata = sqliteTable("content_metadata", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull().unique(),
  thumbnailUrl: text("thumbnail_url"),
  title: text("title"),
  description: text("description"),
  imageUrl: text("image_url"),
  authors: text("authors"), // JSON string array
  releaseYear: text("release_year"),
  symbol: text("symbol"),
  stars: integer("stars"),
  forks: integer("forks"),
  language: text("language"),
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull(),
});

export type ContentMetadata = typeof contentMetadata.$inferSelect;

export const apiRateLimits = sqliteTable("api_rate_limits", {
  key: text("key").primaryKey(),
  requestCount: integer("request_count").notNull(),
  windowStartedAt: integer("window_started_at").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export type ApiRateLimit = typeof apiRateLimits.$inferSelect;
