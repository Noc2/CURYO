import { ponder } from "ponder:registry";
import { encodePacked, keccak256 } from "viem";
import { eq, and } from "ponder";
import {
  pendingCommit,
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
  const commitKey = keccak256(encodePacked(["address", "bytes32"], [voter, commitHash]));

  // Upsert round record — VoteCommitted is the first event for a new round
  const existingRound = await context.db.find(round, { id: roundKey });
  if (!existingRound) {
    // Read epochDuration from contract config
    let epochDuration: bigint | undefined;
    try {
      const cfg = await context.client.readContract({
        abi: context.contracts.RoundVotingEngine.abi,
        address: context.contracts.RoundVotingEngine.address!,
        functionName: "config",
        args: [],
      });
      epochDuration = (cfg as any).epochDuration ?? (cfg as any)[0];
    } catch {
      // Fallback — will be null
    }

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
      epochDuration,
      startTime: event.block.timestamp,
    });
  } else {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      voteCount: row.voteCount + 1,
      totalStake: row.totalStake + stake,
    }));
  }

  // Read revealableAfter from the commit struct on-chain
  let revealableAfter: bigint | undefined;
  try {
    const commitData = await context.client.readContract({
      abi: context.contracts.RoundVotingEngine.abi,
      address: context.contracts.RoundVotingEngine.address!,
      functionName: "getCommit",
      args: [contentId, roundId, commitKey],
    });
    revealableAfter =
      (commitData as any).revealableAfter ?? (commitData as any)[2];
  } catch {
    // Fallback — will be null
  }

  // Create pending commit record
  await context.db
    .insert(pendingCommit)
    .values({
      id: `${contentId}-${roundId}-${commitKey}`,
      contentId,
      roundId,
      voter,
      commitHash,
      stake,
      committedAt: event.block.timestamp,
      revealableAfter: revealableAfter ?? null,
      revealed: false,
    })
    .onConflictDoNothing();
});

ponder.on("RoundVotingEngine:VoteRevealed", async ({ event, context }) => {
  const { contentId, roundId, voter, isUp } = event.args;
  const roundKey = `${contentId}-${roundId}`;
  const voteKey = `${contentId}-${roundId}-${voter}`;

  // VoteRevealed doesn't include commitHash/stake — read from contract state
  const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";
  let stakeAmount = 0n;
  let commitHash: `0x${string}` = ZERO_HASH;
  let commitKey: `0x${string}` = ZERO_HASH;
  try {
    commitHash = (await context.client.readContract({
      abi: context.contracts.RoundVotingEngine.abi,
      address: context.contracts.RoundVotingEngine.address!,
      functionName: "getVoterCommitHash",
      args: [contentId, roundId, voter],
    })) as `0x${string}`;

    if (commitHash !== ZERO_HASH) {
      commitKey = keccak256(encodePacked(["address", "bytes32"], [voter, commitHash]));
      const commitData = await context.client.readContract({
        abi: context.contracts.RoundVotingEngine.abi,
        address: context.contracts.RoundVotingEngine.address!,
        functionName: "getCommit",
        args: [contentId, roundId, commitKey],
      });
      stakeAmount = (commitData as any).stakeAmount ?? (commitData as any)[1] ?? 0n;
    }
  } catch {
    // If contract read fails, stake will be 0 — best effort
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
      stake: stakeAmount,
      commitHash,
      revealedAt: event.block.timestamp,
    })
    .onConflictDoNothing();

  // Mark the pending commit as revealed (skip if not found)
  if (commitKey !== ZERO_HASH) {
    const existingCommit = await context.db.find(pendingCommit, { id: `${contentId}-${roundId}-${commitKey}` });
    if (existingCommit) {
      await context.db
        .update(pendingCommit, { id: `${contentId}-${roundId}-${commitKey}` })
        .set({ revealed: true });
    }
  }

  // Upsert round record — update pools and revealedCount
  const existingRound = await context.db.find(round, { id: roundKey });
  if (!existingRound) {
    await context.db.insert(round).values({
      id: roundKey,
      contentId,
      roundId,
      state: 0, // Open
      voteCount: 0,
      revealedCount: 1,
      totalStake: 0n,
      upPool: isUp ? stakeAmount : 0n,
      downPool: isUp ? 0n : stakeAmount,
      upCount: isUp ? 1 : 0,
      downCount: isUp ? 0 : 1,
    });
  } else {
    await context.db.update(round, { id: roundKey }).set((row) => ({
      revealedCount: row.revealedCount + 1,
      upPool: isUp ? row.upPool + stakeAmount : row.upPool,
      downPool: isUp ? row.downPool : row.downPool + stakeAmount,
      upCount: isUp ? row.upCount + 1 : row.upCount,
      downCount: isUp ? row.downCount : row.downCount + 1,
    }));
  }

  // Update content aggregate and lastActivityAt (skip if content not yet indexed)
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

  // Upsert round — may not exist if no votes were revealed for this content
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
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
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
  // Query all revealed votes for this round
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
  const { contentId, roundId, frontend, amount } = event.args;
  const roundKey = `${contentId}-${roundId}`;

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
      revealedCount: 0,
      totalStake: 0n,
      upPool: 0n,
      downPool: 0n,
      upCount: 0,
      downCount: 0,
    });
  }
});
