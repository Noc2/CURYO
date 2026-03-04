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

ponder.on("RoundVotingEngine:VoteCommitted", async ({ event, context }) => {
  const { contentId, roundId, voter, commitHash, stake } = event.args;
  const roundKey = `${contentId}-${roundId}`;
  const voteKey = `${contentId}-${roundId}-${voter}`;

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
      state: 0, // Open
      voteCount: 1,
      revealedCount: 0,
      totalStake: stake,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
      startTime: event.block.timestamp,
    });
  } else {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      voteCount: row.voteCount + 1,
      totalStake: row.totalStake + stake,
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
      isUp: null,
      stake,
      epochIndex: 0, // placeholder; updated on VoteRevealed with actual epochIndex
      revealed: false,
      committedAt: event.block.timestamp,
      revealedAt: null,
    })
    .onConflictDoNothing();

  // Update content aggregate and lastActivityAt
  const contentRecord = await context.db.find(content, { id: contentId });
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
      state: 1, // Settled
      upWins,
      losingPool,
      settledAt: event.block.timestamp,
    });
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: 1, // Settled
      voteCount: 0,
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
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
    await context.db.update(round, { id: roundKey }).set({ state: 2 }); // Cancelled
  } else {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: 2, // Cancelled
      voteCount: 0,
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
    });
  }
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
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
    });
  }
});

ponder.on("RoundVotingEngine:FrontendFeeClaimed", async ({ event, context }) => {
  const { amount } = event.args;

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

  const existingProfile = await context.db.find(profile, { address: voter });
  if (existingProfile) {
    await context.db
      .update(profile, { address: voter })
      .set((row) => ({ totalRewardsClaimed: row.totalRewardsClaimed + amount }));
  }

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
