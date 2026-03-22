import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    status: text("status").notNull().default("sent"),
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

export const freeTransactionQuotas = sqliteTable(
  "free_transaction_quotas",
  {
    identityKey: text("identity_key").primaryKey(),
    voterIdTokenId: text("voter_id_token_id").notNull(),
    chainId: integer("chain_id").notNull(),
    environment: text("environment").notNull(),
    lastWalletAddress: text("last_wallet_address").notNull(),
    freeTxLimit: integer("free_tx_limit").notNull(),
    freeTxUsed: integer("free_tx_used").notNull(),
    exhaustedAt: integer("exhausted_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    tokenChainEnvUnique: uniqueIndex("free_transaction_quotas_token_chain_env_unique").on(
      table.voterIdTokenId,
      table.chainId,
      table.environment,
    ),
    chainUpdatedAtIdx: index("free_transaction_quotas_chain_updated_at_idx").on(table.chainId, table.updatedAt),
  }),
);

export type FreeTransactionQuota = typeof freeTransactionQuotas.$inferSelect;
export type NewFreeTransactionQuota = typeof freeTransactionQuotas.$inferInsert;

export const freeTransactionReservations = sqliteTable(
  "free_transaction_reservations",
  {
    operationKey: text("operation_key").primaryKey(),
    identityKey: text("identity_key").notNull(),
    voterIdTokenId: text("voter_id_token_id").notNull(),
    chainId: integer("chain_id").notNull(),
    environment: text("environment").notNull(),
    walletAddress: text("wallet_address").notNull(),
    status: text("status").notNull(),
    txHashes: text("tx_hashes"),
    reservedAt: integer("reserved_at", { mode: "timestamp" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
    releasedAt: integer("released_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  table => ({
    identityStatusExpiresIdx: index("free_transaction_reservations_identity_status_expires_idx").on(
      table.identityKey,
      table.status,
      table.expiresAt,
    ),
    walletStatusUpdatedIdx: index("free_transaction_reservations_wallet_status_updated_idx").on(
      table.walletAddress,
      table.status,
      table.updatedAt,
    ),
  }),
);

export type FreeTransactionReservation = typeof freeTransactionReservations.$inferSelect;
export type NewFreeTransactionReservation = typeof freeTransactionReservations.$inferInsert;
