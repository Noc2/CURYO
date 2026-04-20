import { bigint, boolean, index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const signedActionChallenges = pgTable(
  "signed_action_challenges",
  {
    id: text("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    action: text("action").notNull(),
    payloadHash: text("payload_hash").notNull(),
    nonce: text("nonce").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  table => ({
    expiresAtIdx: index("signed_action_challenges_expires_at_idx").on(table.expiresAt),
    walletActionIdx: index("signed_action_challenges_wallet_action_idx").on(table.walletAddress, table.action),
  }),
);

export type SignedActionChallenge = typeof signedActionChallenges.$inferSelect;
export type NewSignedActionChallenge = typeof signedActionChallenges.$inferInsert;

export const signedReadSessions = pgTable(
  "signed_read_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    scope: text("scope").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  table => ({
    walletScopeExpiresIdx: index("signed_read_sessions_wallet_scope_expires_idx").on(
      table.walletAddress,
      table.scope,
      table.expiresAt,
    ),
  }),
);

export const signedWriteSessions = pgTable(
  "signed_write_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    scope: text("scope").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  table => ({
    walletScopeExpiresIdx: index("signed_write_sessions_wallet_scope_expires_idx").on(
      table.walletAddress,
      table.scope,
      table.expiresAt,
    ),
  }),
);

export const watchedContent = pgTable(
  "watched_content",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    contentId: text("content_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  },
  table => ({
    walletContentUnique: uniqueIndex("watched_content_wallet_content_unique").on(table.walletAddress, table.contentId),
    walletCreatedAtIdx: index("watched_content_wallet_created_at_idx").on(table.walletAddress, table.createdAt),
  }),
);

export const contentFeedback = pgTable(
  "content_feedback",
  {
    id: serial("id").primaryKey(),
    contentId: text("content_id").notNull(),
    roundId: text("round_id"),
    chainId: integer("chain_id"),
    authorAddress: text("author_address").notNull(),
    feedbackType: text("feedback_type").notNull(),
    body: text("body").notNull(),
    sourceUrl: text("source_url"),
    feedbackHash: text("feedback_hash"),
    clientNonce: text("client_nonce"),
    payloadSignature: text("payload_signature"),
    moderationStatus: text("moderation_status").notNull().default("approved"),
    visibilityStatus: text("visibility_status").notNull().default("hidden_until_settlement"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    deletedAt: timestamp("deleted_at", { mode: "date", withTimezone: true }),
  },
  table => ({
    contentCreatedAtIdx: index("content_feedback_content_created_at_idx").on(table.contentId, table.createdAt),
    contentRoundIdx: index("content_feedback_content_round_idx").on(table.contentId, table.roundId),
    authorCreatedAtIdx: index("content_feedback_author_created_at_idx").on(table.authorAddress, table.createdAt),
    feedbackHashUnique: uniqueIndex("content_feedback_feedback_hash_unique").on(table.feedbackHash),
  }),
);

export type ContentFeedback = typeof contentFeedback.$inferSelect;
export type NewContentFeedback = typeof contentFeedback.$inferInsert;

export const profileFollows = pgTable(
  "profile_follows",
  {
    id: serial("id").primaryKey(),
    followerAddress: text("follower_address").notNull(),
    targetAddress: text("target_address").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
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

export const notificationPreferences = pgTable("notification_preferences", {
  walletAddress: text("wallet_address").primaryKey(),
  roundResolved: boolean("round_resolved").notNull(),
  settlingSoonHour: boolean("settling_soon_hour").notNull(),
  settlingSoonDay: boolean("settling_soon_day").notNull(),
  followedSubmission: boolean("followed_submission").notNull(),
  followedResolution: boolean("followed_resolution").notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferences = typeof notificationPreferences.$inferInsert;

export const notificationEmailSubscriptions = pgTable(
  "notification_email_subscriptions",
  {
    walletAddress: text("wallet_address").primaryKey(),
    email: text("email").notNull(),
    verifiedAt: timestamp("verified_at", { mode: "date", withTimezone: true }),
    verificationToken: text("verification_token"),
    verificationExpiresAt: timestamp("verification_expires_at", { mode: "date", withTimezone: true }),
    roundResolved: boolean("round_resolved").notNull(),
    settlingSoonHour: boolean("settling_soon_hour").notNull(),
    settlingSoonDay: boolean("settling_soon_day").notNull(),
    followedSubmission: boolean("followed_submission").notNull(),
    followedResolution: boolean("followed_resolution").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  },
  table => ({
    emailUnique: uniqueIndex("notification_email_subscriptions_email_unique").on(table.email),
    verificationTokenUnique: uniqueIndex("notification_email_subscriptions_token_unique").on(table.verificationToken),
  }),
);

export type NotificationEmailSubscription = typeof notificationEmailSubscriptions.$inferSelect;
export type NewNotificationEmailSubscription = typeof notificationEmailSubscriptions.$inferInsert;

export const notificationEmailDeliveries = pgTable(
  "notification_email_deliveries",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    email: text("email").notNull(),
    eventKey: text("event_key").notNull(),
    eventType: text("event_type").notNull(),
    contentId: text("content_id"),
    status: text("status").notNull().default("sent"),
    deliveredAt: timestamp("delivered_at", { mode: "date", withTimezone: true }),
  },
  table => ({
    eventKeyUnique: uniqueIndex("notification_email_deliveries_event_key_unique").on(table.eventKey),
  }),
);

export const notificationEmailDeliveryLeases = pgTable("notification_email_delivery_leases", {
  eventKey: text("event_key").primaryKey(),
  leaseExpiresAt: bigint("lease_expires_at", { mode: "number" }).notNull(),
});

export type NotificationEmailDelivery = typeof notificationEmailDeliveries.$inferSelect;
export type NewNotificationEmailDelivery = typeof notificationEmailDeliveries.$inferInsert;

export const apiRateLimits = pgTable(
  "api_rate_limits",
  {
    key: text("key").primaryKey(),
    requestCount: integer("request_count").notNull(),
    windowStartedAt: bigint("window_started_at", { mode: "number" }).notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
  },
  table => ({
    expiresAtIdx: index("api_rate_limits_expires_at_idx").on(table.expiresAt),
  }),
);

export const apiRateLimitMaintenance = pgTable("api_rate_limit_maintenance", {
  name: text("name").primaryKey(),
  lastCleanupStartedAt: bigint("last_cleanup_started_at", { mode: "number" }).notNull(),
  leaseExpiresAt: bigint("lease_expires_at", { mode: "number" }).notNull(),
});

export type ApiRateLimit = typeof apiRateLimits.$inferSelect;

export const freeTransactionQuotas = pgTable(
  "free_transaction_quotas",
  {
    identityKey: text("identity_key").primaryKey(),
    voterIdTokenId: text("voter_id_token_id").notNull(),
    chainId: integer("chain_id").notNull(),
    environment: text("environment").notNull(),
    lastWalletAddress: text("last_wallet_address").notNull(),
    freeTxLimit: integer("free_tx_limit").notNull(),
    freeTxUsed: integer("free_tx_used").notNull(),
    exhaustedAt: timestamp("exhausted_at", { mode: "date", withTimezone: true }),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
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

export const freeTransactionReservations = pgTable(
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
    reservedAt: timestamp("reserved_at", { mode: "date", withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { mode: "date", withTimezone: true }).notNull(),
    confirmedAt: timestamp("confirmed_at", { mode: "date", withTimezone: true }),
    releasedAt: timestamp("released_at", { mode: "date", withTimezone: true }),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
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

export const x402QuestionSubmissions = pgTable(
  "x402_question_submissions",
  {
    operationKey: text("operation_key").primaryKey(),
    clientRequestId: text("client_request_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    chainId: integer("chain_id").notNull(),
    payerAddress: text("payer_address"),
    paymentAsset: text("payment_asset").notNull(),
    paymentAmount: text("payment_amount").notNull(),
    bountyAmount: text("bounty_amount").notNull(),
    serviceFeeAmount: text("service_fee_amount").notNull(),
    status: text("status").notNull(),
    contentId: text("content_id"),
    rewardPoolId: text("reward_pool_id"),
    transactionHashes: text("transaction_hashes"),
    paymentReceipt: text("payment_receipt"),
    error: text("error"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    submittedAt: timestamp("submitted_at", { mode: "date", withTimezone: true }),
  },
  table => ({
    clientRequestUnique: uniqueIndex("x402_question_submissions_client_request_unique").on(
      table.chainId,
      table.clientRequestId,
    ),
    statusUpdatedIdx: index("x402_question_submissions_status_updated_idx").on(table.status, table.updatedAt),
  }),
);

export type X402QuestionSubmission = typeof x402QuestionSubmissions.$inferSelect;
export type NewX402QuestionSubmission = typeof x402QuestionSubmissions.$inferInsert;
