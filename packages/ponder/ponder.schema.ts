import { index, onchainTable, relations, sql } from "ponder";

// ============================================================
// CONTENT
// ============================================================

export const content = onchainTable(
  "content",
  (t) => ({
    id: t.bigint().primaryKey(),
    submitter: t.hex().notNull(),
    contentHash: t.hex().notNull(),
    url: t.text().notNull(),
    title: t.text().notNull(),
    description: t.text().notNull(),
    tags: t.text().notNull(),
    categoryId: t.bigint().notNull(),
    status: t.integer().notNull(), // 0=Active, 1=Dormant, 2=Cancelled
    rating: t.integer().notNull(), // 0-100, starts at 50
    submitterStakeReturned: t.boolean().notNull(),
    createdAt: t.bigint().notNull(),
    lastActivityAt: t.bigint().notNull(),
    totalVotes: t.integer().notNull(),
    totalRounds: t.integer().notNull(),
  }),
  (table) => ({
    submitterIdx: index().on(table.submitter),
    categoryIdx: index().on(table.categoryId),
    statusIdx: index().on(table.status),
    ratingIdx: index().on(table.rating),
    createdAtIdx: index().on(table.createdAt),
    searchIdx: index("content_search_idx").using(
      "gin",
      sql`(
        setweight(to_tsvector('simple', coalesce(${table.title}, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(${table.tags}, '')), 'B') ||
        setweight(to_tsvector('simple', coalesce(${table.description}, '')), 'C')
      )`,
    ),
  }),
);

export const contentRelations = relations(content, ({ many, one }) => ({
  rounds: many(round),
  category: one(category, {
    fields: [content.categoryId],
    references: [category.id],
  }),
}));

// ============================================================
// ROUND (per content per round)
// ============================================================

export const round = onchainTable(
  "round",
  (t) => ({
    id: t.text().primaryKey(), // `${contentId}-${roundId}`
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    state: t.integer().notNull(), // 0=Open, 1=Settled, 2=Cancelled, 3=Tied, 4=RevealFailed
    voteCount: t.integer().notNull(),   // total commits
    revealedCount: t.integer().notNull().default(0), // revealed votes
    totalStake: t.bigint().notNull(),
    upPool: t.bigint().notNull(),   // raw UP stake (from revealed votes)
    downPool: t.bigint().notNull(), // raw DOWN stake (from revealed votes)
    upCount: t.integer().notNull(),
    downCount: t.integer().notNull(),
    upWins: t.boolean(),
    losingPool: t.bigint(),
    startTime: t.bigint(),
    settledAt: t.bigint(),
  }),
  (table) => ({
    contentIdx: index().on(table.contentId),
    roundIdx: index().on(table.roundId),
    stateIdx: index().on(table.state),
    settledAtIdx: index().on(table.settledAt),
  }),
);

export const roundRelations = relations(round, ({ many, one }) => ({
  contentRef: one(content, {
    fields: [round.contentId],
    references: [content.id],
  }),
  votes: many(vote),
}));

// ============================================================
// VOTE (tlock commit-reveal votes)
// ============================================================

export const vote = onchainTable(
  "vote",
  (t) => ({
    id: t.text().primaryKey(), // `${contentId}-${roundId}-${voter}`
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    voter: t.hex().notNull(),
    isUp: t.boolean(), // null until revealed
    stake: t.bigint().notNull(),
    epochIndex: t.integer().notNull(), // 0=epoch-1 (100% weight), 1=epoch-2+ (25% weight)
    revealed: t.boolean().notNull().default(false),
    committedAt: t.bigint().notNull(),
    revealedAt: t.bigint(), // null until revealed
  }),
  (table) => ({
    voterIdx: index().on(table.voter),
    contentIdx: index().on(table.contentId),
    roundIdx: index().on(table.roundId),
    contentRoundIdx: index().on(table.contentId, table.roundId),
    revealedIdx: index().on(table.revealed),
  }),
);

export const voteRelations = relations(vote, ({ one }) => ({
  roundRef: one(round, {
    fields: [vote.contentId, vote.roundId],
    references: [round.contentId, round.roundId],
  }),
  voterProfile: one(profile, {
    fields: [vote.voter],
    references: [profile.address],
  }),
}));

// ============================================================
// REWARD CLAIMS
// ============================================================

export const rewardClaim = onchainTable(
  "reward_claim",
  (t) => ({
    id: t.text().primaryKey(), // unique claim/event id
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    epochId: t.bigint(), // set only for epoch-based claims (distinguishes from round-based)
    source: t.text().notNull(), // "round", "epoch", or "participation"
    voter: t.hex().notNull(),
    stakeReturned: t.bigint().notNull(),
    crepReward: t.bigint().notNull(),
    claimedAt: t.bigint().notNull(),
  }),
  (table) => ({
    voterIdx: index().on(table.voter),
    contentIdx: index().on(table.contentId),
  }),
);

export const submitterRewardClaim = onchainTable(
  "submitter_reward_claim",
  (t) => ({
    id: t.text().primaryKey(), // `${contentId}-${roundId}`
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    epochId: t.bigint(), // set only for epoch-based claims
    source: t.text().notNull(), // "round" or "epoch"
    submitter: t.hex().notNull(),
    crepAmount: t.bigint().notNull(),
    claimedAt: t.bigint().notNull(),
  }),
  (table) => ({
    submitterIdx: index().on(table.submitter),
  }),
);

// ============================================================
// CATEGORY
// ============================================================

export const category = onchainTable(
  "category",
  (t) => ({
    id: t.bigint().primaryKey(),
    name: t.text().notNull(),
    domain: t.text().notNull(),
    submitter: t.hex().notNull(),
    status: t.integer().notNull(), // 0=Pending, 1=Approved, 2=Rejected, 3=Canceled
    proposalId: t.bigint(),
    createdAt: t.bigint().notNull(),
    totalVotes: t.integer().notNull(),
    totalContent: t.integer().notNull(),
  }),
  (table) => ({
    statusIdx: index().on(table.status),
    domainIdx: index().on(table.domain),
  }),
);

export const categoryRelations = relations(category, ({ many }) => ({
  contents: many(content),
}));

// ============================================================
// PROFILE
// ============================================================

export const profile = onchainTable("profile", (t) => ({
  address: t.hex().primaryKey(),
  name: t.text().notNull(),
  strategy: t.text().notNull(),
  createdAt: t.bigint().notNull(),
  updatedAt: t.bigint().notNull(),
  totalVotes: t.integer().notNull(),
  totalContent: t.integer().notNull(),
  totalRewardsClaimed: t.bigint().notNull(),
}));

// ============================================================
// VOTER ACCURACY STATS (global per voter)
// ============================================================

export const voterStats = onchainTable("voter_stats", (t) => ({
  voter: t.hex().primaryKey(),
  totalSettledVotes: t.integer().notNull(),
  totalWins: t.integer().notNull(),
  totalLosses: t.integer().notNull(),
  totalStakeWon: t.bigint().notNull(),
  totalStakeLost: t.bigint().notNull(),
  currentStreak: t.integer().notNull(), // positive = win streak, negative = loss streak
  bestWinStreak: t.integer().notNull(),
}));

// ============================================================
// VOTER CATEGORY STATS (per voter per category)
// ============================================================

export const voterCategoryStats = onchainTable(
  "voter_category_stats",
  (t) => ({
    id: t.text().primaryKey(), // `${voter}-${categoryId}`
    voter: t.hex().notNull(),
    categoryId: t.bigint().notNull(),
    totalSettledVotes: t.integer().notNull(),
    totalWins: t.integer().notNull(),
    totalLosses: t.integer().notNull(),
    totalStakeWon: t.bigint().notNull(),
    totalStakeLost: t.bigint().notNull(),
  }),
  (table) => ({
    voterIdx: index().on(table.voter),
    categoryIdx: index().on(table.categoryId),
  }),
);

// ============================================================
// FRONTEND
// ============================================================

export const frontend = onchainTable("frontend", (t) => ({
  address: t.hex().primaryKey(),
  operator: t.hex().notNull(),
  stakedAmount: t.bigint().notNull(),
  eligible: t.boolean().notNull(),
  slashed: t.boolean().notNull(),
  exitAvailableAt: t.bigint(),
  totalFeesCredited: t.bigint().notNull(),
  totalFeesClaimed: t.bigint().notNull(),
  registeredAt: t.bigint().notNull(),
}));

// ============================================================
// VOTER ID NFT
// ============================================================

export const voterId = onchainTable(
  "voter_id",
  (t) => ({
    tokenId: t.bigint().primaryKey(),
    holder: t.hex().notNull(),
    nullifier: t.bigint().notNull(),
    mintedAt: t.bigint().notNull(),
    revoked: t.boolean().notNull().default(false),
  }),
  (table) => ({
    holderIdx: index().on(table.holder),
  }),
);

// ============================================================
// TOKEN HOLDERS (cREP)
// ============================================================

export const tokenHolder = onchainTable("token_holder", (t) => ({
  address: t.hex().primaryKey(),
  firstSeenAt: t.bigint().notNull(),
}));

// ============================================================
// TOKEN TRANSFERS (cREP balance history)
// ============================================================

export const tokenTransfer = onchainTable(
  "token_transfer",
  (t) => ({
    id: t.text().primaryKey(), // `${txHash}-${logIndex}`
    from: t.hex().notNull(),
    to: t.hex().notNull(),
    amount: t.bigint().notNull(),
    blockNumber: t.bigint().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    fromIdx: index().on(table.from),
    toIdx: index().on(table.to),
    timestampIdx: index().on(table.timestamp),
  }),
);

// ============================================================
// GLOBAL STATS (singleton, id="global")
// ============================================================

export const globalStats = onchainTable("global_stats", (t) => ({
  id: t.text().primaryKey(),
  totalContent: t.integer().notNull(),
  totalVotes: t.integer().notNull(),
  totalRoundsSettled: t.integer().notNull(),
  totalRewardsClaimed: t.bigint().notNull(),
  totalProfiles: t.integer().notNull(),
  totalVoterIds: t.integer().notNull(),
}));

// ============================================================
// RATING HISTORY
// ============================================================

export const ratingChange = onchainTable(
  "rating_change",
  (t) => ({
    id: t.text().primaryKey(), // `${contentId}-${blockNumber}`
    contentId: t.bigint().notNull(),
    oldRating: t.integer().notNull(),
    newRating: t.integer().notNull(),
    timestamp: t.bigint().notNull(),
  }),
  (table) => ({
    contentIdx: index().on(table.contentId),
  }),
);

// ============================================================
// DAILY VOTE ACTIVITY (per voter per day)
// ============================================================

export const dailyVoteActivity = onchainTable(
  "daily_vote_activity",
  (t) => ({
    id: t.text().primaryKey(), // `${voter}-${YYYYMMDD}`
    voter: t.hex().notNull(),
    date: t.text().notNull(), // YYYYMMDD
    voteCount: t.integer().notNull(),
    firstVoteAt: t.bigint().notNull(),
  }),
  (table) => ({
    voterIdx: index().on(table.voter),
    dateIdx: index().on(table.date),
  }),
);

// ============================================================
// VOTER STREAK (daily voting streak tracking)
// ============================================================

export const voterStreak = onchainTable("voter_streak", (t) => ({
  voter: t.hex().primaryKey(),
  currentDailyStreak: t.integer().notNull(),
  bestDailyStreak: t.integer().notNull(),
  lastActiveDate: t.text().notNull(), // YYYYMMDD
  totalActiveDays: t.integer().notNull(),
  lastMilestoneDay: t.integer().notNull(), // last milestone that triggered a bonus
}));
