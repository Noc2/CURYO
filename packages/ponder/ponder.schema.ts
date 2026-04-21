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
    canonicalUrl: t.text().notNull(),
    urlHost: t.text().notNull(),
    title: t.text().notNull(),
    description: t.text().notNull(),
    tags: t.text().notNull(),
    categoryId: t.bigint().notNull(),
    status: t.integer().notNull(), // 0=Active, 1=Dormant, 2=Cancelled
    rating: t.integer().notNull(), // 0-100, starts at 50
    ratingBps: t.integer().notNull(), // 0-10000, starts at 5000
    conservativeRatingBps: t.integer().notNull(),
    ratingConfidenceMass: t.bigint().notNull(),
    ratingEffectiveEvidence: t.bigint().notNull(),
    ratingSettledRounds: t.integer().notNull(),
    ratingLowSince: t.bigint().notNull(),
    createdAt: t.bigint().notNull(),
    lastActivityAt: t.bigint().notNull(),
    totalVotes: t.integer().notNull(),
    totalRounds: t.integer().notNull(),
    roundEpochDuration: t.integer().notNull().default(1200),
    roundMaxDuration: t.integer().notNull().default(604800),
    roundMinVoters: t.integer().notNull().default(3),
    roundMaxVoters: t.integer().notNull().default(1000),
    bundleId: t.bigint(),
    bundleIndex: t.integer(),
  }),
  (table) => ({
    submitterIdx: index().on(table.submitter),
    categoryIdx: index().on(table.categoryId),
    bundleIdx: index().on(table.bundleId),
    canonicalUrlIdx: index().on(table.canonicalUrl),
    urlHostIdx: index().on(table.urlHost),
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
  media: many(contentMedia),
  category: one(category, {
    fields: [content.categoryId],
    references: [category.id],
  }),
}));

export const contentMedia = onchainTable(
  "content_media",
  (t) => ({
    id: t.text().primaryKey(), // `${contentId}-${mediaIndex}`
    contentId: t.bigint().notNull(),
    mediaIndex: t.integer().notNull(),
    mediaType: t.text().notNull(), // "image" or "video"
    url: t.text().notNull(),
    canonicalUrl: t.text().notNull(),
    urlHost: t.text().notNull(),
  }),
  (table) => ({
    contentIdx: index().on(table.contentId),
    contentIndexIdx: index().on(table.contentId, table.mediaIndex),
    canonicalUrlIdx: index().on(table.canonicalUrl),
    urlHostIdx: index().on(table.urlHost),
  }),
);

export const contentMediaRelations = relations(contentMedia, ({ one }) => ({
  contentRef: one(content, {
    fields: [contentMedia.contentId],
    references: [content.id],
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
    referenceRatingBps: t.integer().notNull(),
    ratingBps: t.integer().notNull(),
    conservativeRatingBps: t.integer().notNull(),
    confidenceMass: t.bigint().notNull(),
    effectiveEvidence: t.bigint().notNull(),
    settledRounds: t.integer().notNull(),
    lowSince: t.bigint().notNull(),
    epochDuration: t.integer().notNull().default(1200),
    maxDuration: t.integer().notNull().default(604800),
    minVoters: t.integer().notNull().default(3),
    maxVoters: t.integer().notNull().default(1000),
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
    commitHash: t.hex().notNull(),
    targetRound: t.bigint().notNull(),
    drandChainHash: t.hex().notNull(),
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
    voterContentCommittedAtIdx: index().on(table.voter, table.contentId, table.committedAt),
    commitHashIdx: index().on(table.commitHash),
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

// ============================================================
// QUESTION REWARD POOLS (cREP or USDC)
// ============================================================

export const questionRewardPool = onchainTable(
  "question_reward_pool",
  (t) => ({
    id: t.bigint().primaryKey(),
    contentId: t.bigint().notNull(),
    funder: t.hex().notNull(),
    funderVoterId: t.bigint().notNull(),
    asset: t.integer().notNull(),
    nonRefundable: t.boolean().notNull(),
    fundedAmount: t.bigint().notNull(),
    unallocatedAmount: t.bigint().notNull(),
    allocatedAmount: t.bigint().notNull(),
    claimedAmount: t.bigint().notNull(),
    voterClaimedAmount: t.bigint().notNull(),
    frontendClaimedAmount: t.bigint().notNull(),
    refundedAmount: t.bigint().notNull(),
    requiredVoters: t.integer().notNull(),
    requiredSettledRounds: t.integer().notNull(),
    qualifiedRounds: t.integer().notNull(),
    frontendFeeBps: t.integer().notNull(),
    startRoundId: t.bigint().notNull(),
    expiresAt: t.bigint().notNull(),
    refunded: t.boolean().notNull(),
    createdAt: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    contentIdx: index().on(table.contentId),
    funderIdx: index().on(table.funder),
    refundedIdx: index().on(table.refunded),
    createdAtIdx: index().on(table.createdAt),
  }),
);

export const questionRewardPoolRound = onchainTable(
  "question_reward_pool_round",
  (t) => ({
    id: t.text().primaryKey(), // `${rewardPoolId}-${roundId}`
    rewardPoolId: t.bigint().notNull(),
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    allocation: t.bigint().notNull(),
    frontendFeeAllocation: t.bigint().notNull(),
    eligibleVoters: t.integer().notNull(),
    claimedAmount: t.bigint().notNull(),
    voterClaimedAmount: t.bigint().notNull(),
    frontendClaimedAmount: t.bigint().notNull(),
    claimedCount: t.integer().notNull(),
    qualifiedAt: t.bigint().notNull(),
  }),
  (table) => ({
    rewardPoolIdx: index().on(table.rewardPoolId),
    contentIdx: index().on(table.contentId),
    roundIdx: index().on(table.contentId, table.roundId),
  }),
);

export const questionRewardPoolClaim = onchainTable(
  "question_reward_pool_claim",
  (t) => ({
    id: t.text().primaryKey(), // `${rewardPoolId}-${roundId}-${voterId}`
    rewardPoolId: t.bigint().notNull(),
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    claimant: t.hex().notNull(),
    voterId: t.bigint().notNull(),
    amount: t.bigint().notNull(),
    grossAmount: t.bigint().notNull(),
    frontend: t.hex().notNull(),
    frontendRecipient: t.hex().notNull(),
    frontendFee: t.bigint().notNull(),
    claimedAt: t.bigint().notNull(),
  }),
  (table) => ({
    rewardPoolIdx: index().on(table.rewardPoolId),
    claimantIdx: index().on(table.claimant),
    voterIdIdx: index().on(table.voterId),
    contentIdx: index().on(table.contentId),
  }),
);

export const questionBundleReward = onchainTable(
  "question_bundle_reward",
  (t) => ({
    id: t.bigint().primaryKey(),
    funder: t.hex().notNull(),
    funderVoterId: t.bigint().notNull(),
    asset: t.integer().notNull(),
    fundedAmount: t.bigint().notNull(),
    claimedAmount: t.bigint().notNull(),
    voterClaimedAmount: t.bigint().notNull(),
    frontendClaimedAmount: t.bigint().notNull(),
    refundedAmount: t.bigint().notNull(),
    requiredCompleters: t.integer().notNull(),
    questionCount: t.integer().notNull(),
    completedQuestionCount: t.integer().notNull(),
    claimedCount: t.integer().notNull(),
    frontendFeeBps: t.integer().notNull(),
    expiresAt: t.bigint().notNull(),
    failed: t.boolean().notNull(),
    refunded: t.boolean().notNull(),
    createdAt: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    funderIdx: index().on(table.funder),
    assetIdx: index().on(table.asset),
    failedIdx: index().on(table.failed),
    refundedIdx: index().on(table.refunded),
    createdAtIdx: index().on(table.createdAt),
  }),
);

export const questionBundleQuestion = onchainTable(
  "question_bundle_question",
  (t) => ({
    id: t.text().primaryKey(), // `${bundleId}-${bundleIndex}`
    bundleId: t.bigint().notNull(),
    contentId: t.bigint().notNull(),
    bundleIndex: t.integer().notNull(),
    roundId: t.bigint(),
    settled: t.boolean().notNull(),
    terminal: t.boolean().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    bundleIdx: index().on(table.bundleId),
    contentIdx: index().on(table.contentId),
    bundleIndexIdx: index().on(table.bundleId, table.bundleIndex),
    terminalIdx: index().on(table.terminal),
  }),
);

export const questionBundleClaim = onchainTable(
  "question_bundle_claim",
  (t) => ({
    id: t.text().primaryKey(), // `${bundleId}-${voterId}`
    bundleId: t.bigint().notNull(),
    claimant: t.hex().notNull(),
    voterId: t.bigint().notNull(),
    amount: t.bigint().notNull(),
    grossAmount: t.bigint().notNull(),
    frontend: t.hex().notNull(),
    frontendRecipient: t.hex().notNull(),
    frontendFee: t.bigint().notNull(),
    claimedAt: t.bigint().notNull(),
  }),
  (table) => ({
    bundleIdx: index().on(table.bundleId),
    claimantIdx: index().on(table.claimant),
    voterIdIdx: index().on(table.voterId),
  }),
);

// ============================================================
// FEEDBACK BONUS POOLS (USDC)
// ============================================================

export const feedbackBonusPool = onchainTable(
  "feedback_bonus_pool",
  (t) => ({
    id: t.bigint().primaryKey(),
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    funder: t.hex().notNull(),
    awarder: t.hex().notNull(),
    fundedAmount: t.bigint().notNull(),
    remainingAmount: t.bigint().notNull(),
    awardedAmount: t.bigint().notNull(),
    voterAwardedAmount: t.bigint().notNull(),
    frontendAwardedAmount: t.bigint().notNull(),
    forfeitedAmount: t.bigint().notNull(),
    awardCount: t.integer().notNull(),
    awardDeadline: t.bigint().notNull(),
    frontendFeeBps: t.integer().notNull(),
    forfeited: t.boolean().notNull(),
    createdAt: t.bigint().notNull(),
    updatedAt: t.bigint().notNull(),
  }),
  (table) => ({
    contentIdx: index().on(table.contentId),
    roundIdx: index().on(table.contentId, table.roundId),
    funderIdx: index().on(table.funder),
    awarderIdx: index().on(table.awarder),
    forfeitedIdx: index().on(table.forfeited),
  }),
);

export const feedbackBonusAward = onchainTable(
  "feedback_bonus_award",
  (t) => ({
    id: t.text().primaryKey(), // `${poolId}-${feedbackHash}`
    poolId: t.bigint().notNull(),
    contentId: t.bigint().notNull(),
    roundId: t.bigint().notNull(),
    recipient: t.hex().notNull(),
    voterId: t.bigint().notNull(),
    feedbackHash: t.hex().notNull(),
    grossAmount: t.bigint().notNull(),
    recipientAmount: t.bigint().notNull(),
    frontend: t.hex().notNull(),
    frontendRecipient: t.hex().notNull(),
    frontendFee: t.bigint().notNull(),
    awardedAt: t.bigint().notNull(),
  }),
  (table) => ({
    poolIdx: index().on(table.poolId),
    contentIdx: index().on(table.contentId),
    roundIdx: index().on(table.contentId, table.roundId),
    recipientIdx: index().on(table.recipient),
    voterIdIdx: index().on(table.voterId),
    feedbackHashIdx: index().on(table.feedbackHash),
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
    slug: t.text().notNull(),
    createdAt: t.bigint().notNull(),
    totalVotes: t.integer().notNull(),
    totalContent: t.integer().notNull(),
  }),
  (table) => ({
    slugIdx: index().on(table.slug),
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
  selfReport: t.text().notNull(),
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
    roundId: t.bigint().notNull(),
    oldRating: t.integer().notNull(),
    newRating: t.integer().notNull(),
    referenceRatingBps: t.integer().notNull(),
    oldRatingBps: t.integer().notNull(),
    newRatingBps: t.integer().notNull(),
    conservativeRatingBps: t.integer().notNull(),
    confidenceMass: t.bigint().notNull(),
    effectiveEvidence: t.bigint().notNull(),
    settledRounds: t.integer().notNull(),
    lowSince: t.bigint().notNull(),
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
