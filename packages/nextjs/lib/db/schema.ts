import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  contentId: text("content_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

export const signedActionChallenges = sqliteTable(
  "signed_action_challenges",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    action: text("action").notNull(),
    payloadHash: text("payload_hash").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    usedAt: integer("used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    expiresAtIdx: index("signed_action_challenges_expires_at_idx").on(table.expiresAt),
    walletActionIdx: index("signed_action_challenges_wallet_action_idx").on(table.walletAddress, table.action),
  }),
);

export type SignedActionChallenge = typeof signedActionChallenges.$inferSelect;
export type NewSignedActionChallenge = typeof signedActionChallenges.$inferInsert;

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

export const profileFollows = sqliteTable(
  "profile_follows",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    followerAddress: text("follower_address").notNull(),
    targetAddress: text("target_address").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    followerTargetUnique: uniqueIndex("profile_follows_follower_target_unique").on(
      table.followerAddress,
      table.targetAddress,
    ),
    followerCreatedAtIdx: index("profile_follows_follower_created_at_idx").on(table.followerAddress, table.createdAt),
    targetCreatedAtIdx: index("profile_follows_target_created_at_idx").on(table.targetAddress, table.createdAt),
  }),
);

export type ProfileFollow = typeof profileFollows.$inferSelect;
export type NewProfileFollow = typeof profileFollows.$inferInsert;

export const notificationPreferences = sqliteTable("notification_preferences", {
  walletAddress: text("wallet_address").primaryKey(),
  roundResolved: integer("round_resolved", { mode: "boolean" }).notNull(),
  settlingSoonHour: integer("settling_soon_hour", { mode: "boolean" }).notNull(),
  settlingSoonDay: integer("settling_soon_day", { mode: "boolean" }).notNull(),
  followedSubmission: integer("followed_submission", { mode: "boolean" }).notNull(),
  followedResolution: integer("followed_resolution", { mode: "boolean" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;

export const notificationEmailSubscriptions = sqliteTable(
  "notification_email_subscriptions",
  {
    walletAddress: text("wallet_address").primaryKey(),
    email: text("email").notNull(),
    verifiedAt: integer("verified_at", { mode: "timestamp" }),
    verificationToken: text("verification_token"),
    verificationExpiresAt: integer("verification_expires_at", { mode: "timestamp" }),
    roundResolved: integer("round_resolved", { mode: "boolean" }).notNull(),
    settlingSoonHour: integer("settling_soon_hour", { mode: "boolean" }).notNull(),
    settlingSoonDay: integer("settling_soon_day", { mode: "boolean" }).notNull(),
    followedSubmission: integer("followed_submission", { mode: "boolean" }).notNull(),
    followedResolution: integer("followed_resolution", { mode: "boolean" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    emailUnique: uniqueIndex("notification_email_subscriptions_email_unique").on(table.email),
    verificationTokenUnique: uniqueIndex("notification_email_subscriptions_token_unique").on(table.verificationToken),
  }),
);

export type NotificationEmailSubscription = typeof notificationEmailSubscriptions.$inferSelect;
export type NewNotificationEmailSubscription = typeof notificationEmailSubscriptions.$inferInsert;

export const notificationEmailDeliveries = sqliteTable(
  "notification_email_deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    walletAddress: text("wallet_address").notNull(),
    email: text("email").notNull(),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    contentId: text("content_id"),
    deliveredAt: integer("delivered_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    eventKeyUnique: uniqueIndex("notification_email_deliveries_event_key_unique").on(table.eventKey),
  }),
);

export type NotificationEmailDelivery = typeof notificationEmailDeliveries.$inferSelect;
export type NewNotificationEmailDelivery = typeof notificationEmailDeliveries.$inferInsert;

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
