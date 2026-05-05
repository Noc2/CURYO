import { ponder } from "ponder:registry";
import {
  rewardClaim,
  profile,
  globalStats,
} from "ponder:schema";

ponder.on(
  "RoundRewardDistributor:RewardClaimed",
  async ({ event, context }) => {
    const { contentId, roundId, voter, stakePayer, stakeReturned, reward } =
      event.args;

    // Funds split: `stakeReturned` was sent to `stakePayer`; `reward` was sent to `voter`.
    // When stakePayer == voter (no delegation, or delegate unchanged) both flows hit the same
    // address but each component is still attributed to the correct slot.
    const totalPayout = stakeReturned + reward;

    await context.db
      .insert(rewardClaim)
      .values({
        id: `${contentId}-${roundId}-${voter}`,
        contentId,
        roundId,
        epochId: null,
        source: "round",
        voter,
        stakePayer,
        stakeReturned,
        hrepReward: reward,
        claimedAt: event.block.timestamp,
      })
      .onConflictDoNothing();

    // Credit the reward portion to `voter` (current SBT holder).
    if (reward > 0n) {
      const voterProfile = await context.db.find(profile, { address: voter });
      if (voterProfile) {
        await context.db
          .update(profile, { address: voter })
          .set((row) => ({
            totalRewardsClaimed: row.totalRewardsClaimed + reward,
          }));
      }
    }

    // Credit the stake-refund portion to `stakePayer` (commit.voter — the EOA that
    // funded the stake, typically a delegate). When stakePayer == voter we still issue
    // a separate update so each component is attributed to its own row.
    if (stakeReturned > 0n) {
      const payerProfile = await context.db.find(profile, { address: stakePayer });
      if (payerProfile) {
        await context.db
          .update(profile, { address: stakePayer })
          .set((row) => ({
            totalRewardsClaimed: row.totalRewardsClaimed + stakeReturned,
          }));
      }
    }

    // Update global stats
    await context.db
      .insert(globalStats)
      .values({
        id: "global",
        totalContent: 0,
        totalVotes: 0,
        totalRoundsSettled: 0,
        totalRewardsClaimed: totalPayout,
        totalProfiles: 0,
        totalVoterIds: 0,
      })
      .onConflictDoUpdate((row) => ({
        totalRewardsClaimed: row.totalRewardsClaimed + totalPayout,
      }));
  },
);

ponder.on(
  "RoundRewardDistributor:FrontendFeeClaimed",
  async ({ event, context }) => {
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
  },
);

ponder.on(
  "RoundRewardDistributor:ParticipationRewardClaimed",
  async ({ event, context }) => {
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
        hrepReward: amount,
        claimedAt: event.block.timestamp,
      })
      .onConflictDoNothing();

    const existingProfile = await context.db.find(profile, { address: voter });
    if (existingProfile) {
      await context.db
        .update(profile, { address: voter })
        .set((row) => ({
          totalRewardsClaimed: row.totalRewardsClaimed + amount,
        }));
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
  },
);
