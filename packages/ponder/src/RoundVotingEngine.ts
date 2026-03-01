import { ponder } from "ponder:registry";
import { eq, and } from "ponder";
import {
  round,
  vote,
  content,
  category,
  profile,
  rewardClaim,
  globalStats,
  voterStats,
  voterCategoryStats,
} from "ponder:schema";

// Round states: Open(0), Settled(1), Cancelled(2), Tied(3)

ponder.on("RoundVotingEngine:VotePublished", async ({ event, context }) => {
  const { contentId, roundId, voter, isUp, stake, shares, newRating } = event.args;
  const roundKey = `${contentId}-${roundId}`;
  const voteKey = `${contentId}-${roundId}-${voter}`;

  // Upsert round record — VotePublished is the first event for a new round
  const existingRound = await context.db.find(round, { id: roundKey });
  if (!existingRound) {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: 0, // Open
      voteCount: 1,
      totalStake: stake,
      upStake: isUp ? stake : 0n,
      downStake: isUp ? 0n : stake,
      totalUpShares: isUp ? shares : 0n,
      totalDownShares: isUp ? 0n : shares,
      upCount: isUp ? 1 : 0,
      downCount: isUp ? 0 : 1,
      startBlock: BigInt(event.block.number),
      startTime: event.block.timestamp,
    });
  } else {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      voteCount: row.voteCount + 1,
      totalStake: row.totalStake + stake,
      upStake: isUp ? row.upStake + stake : row.upStake,
      downStake: isUp ? row.downStake : row.downStake + stake,
      totalUpShares: isUp ? row.totalUpShares + shares : row.totalUpShares,
      totalDownShares: isUp ? row.totalDownShares : row.totalDownShares + shares,
      upCount: isUp ? row.upCount + 1 : row.upCount,
      downCount: isUp ? row.downCount : row.downCount + 1,
    }));
  }

  // Create vote record
  await context.db
    .insert(vote)
    .values({
      id: voteKey,
      contentId,
      roundId,
      voter,
      isUp,
      stake,
      shares,
      votedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  // Update content aggregate, rating, and lastActivityAt (skip if content not yet indexed)
  const contentRecord = await context.db.find(content, { id: contentId });
  if (contentRecord) {
    await context.db
      .update(content, { id: contentId })
      .set((row) => ({
        totalVotes: row.totalVotes + 1,
        rating: newRating,
        lastActivityAt: event.block.timestamp,
      }));

    // Update category aggregate
    if (contentRecord.categoryId > 0n) {
      const existingCategory = await context.db.find(category, { id: contentRecord.categoryId });
      if (existingCategory) {
        await context.db
          .update(category, { id: contentRecord.categoryId })
          .set((row) => ({ totalVotes: row.totalVotes + 1 }));
      }
    }
  }

  // Update voter profile aggregate (skip if profile not yet indexed)
  const existingProfile = await context.db.find(profile, { address: voter });
  if (existingProfile) {
    await context.db
      .update(profile, { address: voter })
      .set((row) => ({ totalVotes: row.totalVotes + 1 }));
  }

  // Update global stats
  await context.db
    .insert(globalStats)
    .values({
      id: "global",
      totalContent: 0,
      totalVotes: 1,
      totalRoundsSettled: 0,
      totalRewardsClaimed: 0n,
      totalProfiles: 0,
      totalVoterIds: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalVotes: row.totalVotes + 1,
    }));
});

ponder.on("RoundVotingEngine:RoundSettled", async ({ event, context }) => {
  const { contentId, roundId, upWins, totalPool } = event.args;
  const roundKey = `${contentId}-${roundId}`;

  // Upsert round — may not exist if no votes were indexed for this content
  const existingRound = await context.db.find(round, { id: roundKey });
  if (existingRound) {
    await context.db.update(round, { id: roundKey }).set({
      state: 1, // Settled
      upWins,
      totalPool,
      settledAt: event.block.timestamp,
    });
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: 1, // Settled
      voteCount: 0,
      totalStake: 0n,
      upStake: 0n,
      downStake: 0n,
      totalUpShares: 0n,
      totalDownShares: 0n,
      upCount: 0,
      downCount: 0,
      upWins,
      totalPool,
      settledAt: event.block.timestamp,
    });
  }

  // Increment content round count (skip if content not yet indexed)
  const contentRecord = await context.db.find(content, { id: contentId });
  if (contentRecord) {
    await context.db
      .update(content, { id: contentId })
      .set((row) => ({ totalRounds: row.totalRounds + 1 }));
  }

  // Update global stats
  await context.db
    .insert(globalStats)
    .values({
      id: "global",
      totalContent: 0,
      totalVotes: 0,
      totalRoundsSettled: 1,
      totalRewardsClaimed: 0n,
      totalProfiles: 0,
      totalVoterIds: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalRoundsSettled: row.totalRoundsSettled + 1,
    }));

  // ---- Accuracy tracking ----
  // Query all votes for this round
  const roundVotes = await context.db.sql
    .select()
    .from(vote)
    .where(and(eq(vote.contentId, contentId), eq(vote.roundId, roundId)));

  // Get categoryId from content record (already fetched above)
  const categoryId = contentRecord?.categoryId ?? 0n;

  for (const v of roundVotes) {
    const won = v.isUp === upWins;
    const stake = v.stake;

    // Upsert voterStats
    await context.db
      .insert(voterStats)
      .values({
        voter: v.voter,
        totalSettledVotes: 1,
        totalWins: won ? 1 : 0,
        totalLosses: won ? 0 : 1,
        totalStakeWon: won ? stake : 0n,
        totalStakeLost: won ? 0n : stake,
        currentStreak: won ? 1 : -1,
        bestWinStreak: won ? 1 : 0,
      })
      .onConflictDoUpdate((row) => {
        const newStreak = won
          ? (row.currentStreak > 0 ? row.currentStreak + 1 : 1)
          : (row.currentStreak < 0 ? row.currentStreak - 1 : -1);
        return {
          totalSettledVotes: row.totalSettledVotes + 1,
          totalWins: row.totalWins + (won ? 1 : 0),
          totalLosses: row.totalLosses + (won ? 0 : 1),
          totalStakeWon: row.totalStakeWon + (won ? stake : 0n),
          totalStakeLost: row.totalStakeLost + (won ? 0n : stake),
          currentStreak: newStreak,
          bestWinStreak: Math.max(row.bestWinStreak, won ? newStreak : 0),
        };
      });

    // Upsert voterCategoryStats (only if content has a category)
    if (categoryId > 0n) {
      const catStatsId = `${v.voter}-${categoryId}`;
      await context.db
        .insert(voterCategoryStats)
        .values({
          id: catStatsId,
          voter: v.voter,
          categoryId,
          totalSettledVotes: 1,
          totalWins: won ? 1 : 0,
          totalLosses: won ? 0 : 1,
          totalStakeWon: won ? stake : 0n,
          totalStakeLost: won ? 0n : stake,
        })
        .onConflictDoUpdate((row) => ({
          totalSettledVotes: row.totalSettledVotes + 1,
          totalWins: row.totalWins + (won ? 1 : 0),
          totalLosses: row.totalLosses + (won ? 0 : 1),
          totalStakeWon: row.totalStakeWon + (won ? stake : 0n),
          totalStakeLost: row.totalStakeLost + (won ? 0n : stake),
        }));
    }
  }
});

ponder.on("RoundVotingEngine:RoundCancelled", async ({ event, context }) => {
  const { contentId, roundId } = event.args;
  const roundKey = `${contentId}-${roundId}`;

  const existingRound = await context.db.find(round, { id: roundKey });
  if (existingRound) {
    await context.db.update(round, { id: roundKey }).set({ state: 2 }); // Cancelled
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: 2, // Cancelled
      voteCount: 0,
      totalStake: 0n,
      upStake: 0n,
      downStake: 0n,
      totalUpShares: 0n,
      totalDownShares: 0n,
      upCount: 0,
      downCount: 0,
    });
  }
});

ponder.on("RoundVotingEngine:FrontendFeeClaimed", async ({ event, context }) => {
  const { contentId, roundId, frontend, amount } = event.args;

  // Update global stats — track total rewards claimed
  await context.db
    .insert(globalStats)
    .values({
      id: "global",
      totalContent: 0,
      totalVotes: 0,
      totalRoundsSettled: 0,
      totalRewardsClaimed: amount,
      totalProfiles: 0,
      totalVoterIds: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalRewardsClaimed: row.totalRewardsClaimed + amount,
    }));
});

ponder.on("RoundVotingEngine:ParticipationRewardClaimed", async ({ event, context }) => {
  const { contentId, roundId, voter, amount } = event.args;

  await context.db
    .insert(rewardClaim)
    .values({
      id: `${event.transaction.hash}-${event.log.logIndex}`,
      contentId,
      roundId,
      source: "participation",
      voter,
      stakeReturned: 0n,
      crepReward: amount,
      claimedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  // Update voter profile aggregate (skip if profile not yet indexed)
  const existingProfile = await context.db.find(profile, { address: voter });
  if (existingProfile) {
    await context.db
      .update(profile, { address: voter })
      .set((row) => ({ totalRewardsClaimed: row.totalRewardsClaimed + amount }));
  }

  // Update global stats
  await context.db
    .insert(globalStats)
    .values({
      id: "global",
      totalContent: 0,
      totalVotes: 0,
      totalRoundsSettled: 0,
      totalRewardsClaimed: amount,
      totalProfiles: 0,
      totalVoterIds: 0,
    })
    .onConflictDoUpdate((row) => ({
      totalRewardsClaimed: row.totalRewardsClaimed + amount,
    }));
});

ponder.on("RoundVotingEngine:RoundTied", async ({ event, context }) => {
  const { contentId, roundId } = event.args;
  const roundKey = `${contentId}-${roundId}`;

  const existingRound = await context.db.find(round, { id: roundKey });
  if (existingRound) {
    await context.db.update(round, { id: roundKey }).set({ state: 3 }); // Tied
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: 3, // Tied
      voteCount: 0,
      totalStake: 0n,
      upStake: 0n,
      downStake: 0n,
      totalUpShares: 0n,
      totalDownShares: 0n,
      upCount: 0,
      downCount: 0,
    });
  }
});
