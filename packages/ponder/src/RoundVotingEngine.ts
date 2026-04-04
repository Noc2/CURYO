import { ponder } from "ponder:registry";
import { eq, and } from "ponder";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import {
  round,
  vote,
  content,
  category,
  profile,
  rewardClaim,
  submitterRewardClaim,
  globalStats,
  voterStats,
  voterCategoryStats,
  dailyVoteActivity,
  voterStreak,
} from "ponder:schema";
import { formatUtcDateKey, getPreviousUtcDateKey, normalizeUtcDateKey } from "./streak-utils.js";

ponder.on("RoundVotingEngine:VoteCommitted", async ({ event, context }) => {
  const { contentId, roundId, voter, commitHash, targetRound, drandChainHash, stake } = event.args as {
    contentId: bigint;
    roundId: bigint;
    voter: `0x${string}`;
    commitHash: `0x${string}`;
    targetRound: bigint;
    drandChainHash: `0x${string}`;
    stake: bigint;
  };
  const roundKey = `${contentId}-${roundId}`;
  const voteKey = `${contentId}-${roundId}-${voter}`;
  const contentRecord = await context.db.find(content, { id: contentId });
  const referenceRatingBps = contentRecord
    ? (contentRecord.ratingBps > 0 ? contentRecord.ratingBps : contentRecord.rating * 100)
    : 5000;

  // Compute epochIndex from round startTime and event timestamp
  // We'll store it as 0 or 1 based on whether it's in epoch-1
  // The exact epochIndex is available from on-chain data; for now we track the commit
  // epochIndex will be updated properly when VoteRevealed fires (from commit.epochIndex)
  // For now, use a placeholder — actual epochIndex from the Commit struct is known on-chain

  // Upsert round record — VoteCommitted is the first event for a new round
  const existingRound = await context.db.find(round, { id: roundKey });
  if (!existingRound) {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: ROUND_STATE.Open,
      voteCount: 1,
      revealedCount: 0,
      totalStake: stake,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
      referenceRatingBps,
      ratingBps: referenceRatingBps,
      conservativeRatingBps: referenceRatingBps,
      confidenceMass: 0n,
      effectiveEvidence: 0n,
      settledRounds: 0,
      lowSince: 0n,
      startTime: event.block.timestamp,
    });
  } else {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      voteCount: row.voteCount + 1,
      totalStake: row.totalStake + stake,
      referenceRatingBps: row.referenceRatingBps > 0 ? row.referenceRatingBps : referenceRatingBps,
      ratingBps: row.ratingBps > 0 ? row.ratingBps : referenceRatingBps,
      conservativeRatingBps: row.conservativeRatingBps > 0 ? row.conservativeRatingBps : referenceRatingBps,
    }));
  }

  // Create vote record (direction hidden until revealed)
  await context.db
    .insert(vote)
    .values({
      id: voteKey,
      contentId,
      roundId,
      voter,
      commitHash,
      targetRound,
      drandChainHash,
      isUp: null,
      stake,
      epochIndex: 0, // placeholder; updated on VoteRevealed with actual epochIndex
      revealed: false,
      committedAt: event.block.timestamp,
      revealedAt: null,
    })
    .onConflictDoNothing();

  // Update content aggregate and lastActivityAt
  if (contentRecord) {
    await context.db
      .update(content, { id: contentId })
      .set((row) => ({
        totalVotes: row.totalVotes + 1,
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

  // Update voter profile aggregate
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

  // --- Daily streak tracking ---
  const date = new Date(Number(event.block.timestamp) * 1000);
  const dateStr = formatUtcDateKey(date);
  const activityKey = `${voter}-${dateStr}`;

  // Upsert daily activity
  await context.db
    .insert(dailyVoteActivity)
    .values({
      id: activityKey,
      voter,
      date: dateStr,
      voteCount: 1,
      firstVoteAt: event.block.timestamp,
    })
    .onConflictDoUpdate((row) => ({
      voteCount: row.voteCount + 1,
    }));

  // Compute yesterday's date string
  const yesterdayStr = getPreviousUtcDateKey(dateStr);

  // Upsert voter streak
  const existingStreak = await context.db.find(voterStreak, { voter });
  if (!existingStreak) {
    await context.db.insert(voterStreak).values({
      voter,
      currentDailyStreak: 1,
      bestDailyStreak: 1,
      lastActiveDate: dateStr,
      totalActiveDays: 1,
      lastMilestoneDay: 0,
    });
  } else if (normalizeUtcDateKey(existingStreak.lastActiveDate) === dateStr) {
    // Already active today — no streak change
    if (existingStreak.lastActiveDate !== dateStr) {
      await context.db.update(voterStreak, { voter }).set({
        lastActiveDate: dateStr,
      });
    }
  } else if (yesterdayStr !== null && normalizeUtcDateKey(existingStreak.lastActiveDate) === yesterdayStr) {
    // Consecutive day — increment streak
    const newStreak = existingStreak.currentDailyStreak + 1;
    await context.db.update(voterStreak, { voter }).set({
      currentDailyStreak: newStreak,
      bestDailyStreak: Math.max(existingStreak.bestDailyStreak, newStreak),
      lastActiveDate: dateStr,
      totalActiveDays: existingStreak.totalActiveDays + 1,
    });
  } else {
    // Gap — reset streak to 1 (also reset milestones to match on-chain)
    await context.db.update(voterStreak, { voter }).set({
      currentDailyStreak: 1,
      lastActiveDate: dateStr,
      totalActiveDays: existingStreak.totalActiveDays + 1,
      lastMilestoneDay: 0,
    });
  }
});

ponder.on("RoundVotingEngine:VoteRevealed", async ({ event, context }) => {
  const { contentId, roundId, voter, isUp } = event.args;
  const roundKey = `${contentId}-${roundId}`;
  const voteKey = `${contentId}-${roundId}-${voter}`;

  // Mark vote as revealed (direction now known)
  const existingVote = await context.db.find(vote, { id: voteKey });
  if (existingVote) {
    await context.db.update(vote, { id: voteKey }).set({
      isUp,
      revealed: true,
      revealedAt: event.block.timestamp,
      // epochIndex is not available from VoteRevealed event; keep existing
    });
  }

  // Update round pools (direction now known)
  const existingRound = await context.db.find(round, { id: roundKey });
  if (existingRound) {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      revealedCount: row.revealedCount + 1,
      upPool: isUp ? row.upPool + (existingVote?.stake ?? 0n) : row.upPool,
      downPool: isUp ? row.downPool : row.downPool + (existingVote?.stake ?? 0n),
      upCount: isUp ? row.upCount + 1 : row.upCount,
      downCount: isUp ? row.downCount : row.downCount + 1,
    }));
  }
});

ponder.on("RoundVotingEngine:RoundSettled", async ({ event, context }) => {
  const { contentId, roundId, upWins, losingPool } = event.args;
  const roundKey = `${contentId}-${roundId}`;

  const existingRound = await context.db.find(round, { id: roundKey });
  if (existingRound) {
    await context.db.update(round, { id: roundKey }).set({
      state: ROUND_STATE.Settled,
      upWins,
      losingPool,
      settledAt: event.block.timestamp,
    });
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: ROUND_STATE.Settled,
      voteCount: 0,
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
      referenceRatingBps: 5000,
      ratingBps: 5000,
      conservativeRatingBps: 5000,
      confidenceMass: 0n,
      effectiveEvidence: 0n,
      settledRounds: 0,
      lowSince: 0n,
      upWins,
      losingPool,
      settledAt: event.block.timestamp,
    });
  }

  // Increment content round count
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

  // Accuracy tracking — only for revealed votes
  const roundVotes = await context.db.sql
    .select()
    .from(vote)
    .where(and(eq(vote.contentId, contentId), eq(vote.roundId, roundId), eq(vote.revealed, true)));

  const categoryId = contentRecord?.categoryId ?? 0n;

  for (const v of roundVotes) {
    if (v.isUp === null) continue; // skip unrevealed
    const won = v.isUp === upWins;
    const stake = v.stake;

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
    await context.db.update(round, { id: roundKey }).set((row) => ({
      state: ROUND_STATE.Cancelled,
      referenceRatingBps: row.referenceRatingBps > 0 ? row.referenceRatingBps : 5000,
      ratingBps: row.ratingBps > 0 ? row.ratingBps : 5000,
      conservativeRatingBps: row.conservativeRatingBps > 0 ? row.conservativeRatingBps : 5000,
    }));
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: ROUND_STATE.Cancelled,
      voteCount: 0,
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
      referenceRatingBps: 5000,
      ratingBps: 5000,
      conservativeRatingBps: 5000,
      confidenceMass: 0n,
      effectiveEvidence: 0n,
      settledRounds: 0,
      lowSince: 0n,
    });
  }
});

ponder.on("RoundVotingEngine:RoundTied", async ({ event, context }) => {
  const { contentId, roundId } = event.args;
  const roundKey = `${contentId}-${roundId}`;

  const existingRound = await context.db.find(round, { id: roundKey });
  if (existingRound) {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      state: ROUND_STATE.Tied,
      referenceRatingBps: row.referenceRatingBps > 0 ? row.referenceRatingBps : 5000,
      ratingBps: row.ratingBps > 0 ? row.ratingBps : 5000,
      conservativeRatingBps: row.conservativeRatingBps > 0 ? row.conservativeRatingBps : 5000,
    }));
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: ROUND_STATE.Tied,
      voteCount: 0,
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
      referenceRatingBps: 5000,
      ratingBps: 5000,
      conservativeRatingBps: 5000,
      confidenceMass: 0n,
      effectiveEvidence: 0n,
      settledRounds: 0,
      lowSince: 0n,
    });
  }
});

ponder.on("RoundVotingEngine:RoundRevealFailed", async ({ event, context }) => {
  const { contentId, roundId } = event.args;
  const roundKey = `${contentId}-${roundId}`;

  const existingRound = await context.db.find(round, { id: roundKey });
  if (existingRound) {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      state: ROUND_STATE.RevealFailed,
      referenceRatingBps: row.referenceRatingBps > 0 ? row.referenceRatingBps : 5000,
      ratingBps: row.ratingBps > 0 ? row.ratingBps : 5000,
      conservativeRatingBps: row.conservativeRatingBps > 0 ? row.conservativeRatingBps : 5000,
    }));
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: ROUND_STATE.RevealFailed,
      voteCount: 0,
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
      referenceRatingBps: 5000,
      ratingBps: 5000,
      conservativeRatingBps: 5000,
      confidenceMass: 0n,
      effectiveEvidence: 0n,
      settledRounds: 0,
      lowSince: 0n,
    });
  }
});

ponder.on("RoundVotingEngine:CancelledRoundRefundClaimed", async ({ event, context }) => {
  const { contentId, roundId, voter, amount } = event.args;

  // Record refund as a reward claim with source "refund"
  await context.db
    .insert(rewardClaim)
    .values({
      id: `refund-${contentId}-${roundId}-${voter}`,
      contentId,
      roundId,
      epochId: null,
      source: "refund",
      voter,
      stakeReturned: amount,
      crepReward: 0n,
      claimedAt: event.block.timestamp,
    })
    .onConflictDoNothing();
});


ponder.on("RoundVotingEngine:CategorySubmitterRewarded", async ({ event, context }) => {
  const { contentId, categoryId, submitter, amount } = event.args;

  await context.db
    .insert(submitterRewardClaim)
    .values({
      id: `cat-${contentId}-${categoryId}-${event.block.number}`,
      contentId,
      roundId: 0n,
      epochId: null,
      source: "category",
      submitter,
      crepAmount: amount,
      claimedAt: event.block.timestamp,
    })
    .onConflictDoNothing();
});
