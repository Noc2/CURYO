import { ponder } from "ponder:registry";
import {
  rewardClaim,
  submitterRewardClaim,
  profile,
  globalStats,
} from "ponder:schema";

ponder.on(
  "RoundRewardDistributor:RewardClaimed",
  async ({ event, context }) => {
    const { contentId, roundId, voter, stakeReturned, reward } =
      event.args;

    // Total payout = stake returned + reward earned
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
        stakeReturned,
        crepReward: reward,
        claimedAt: event.block.timestamp,
      })
      .onConflictDoNothing();

    // Update profile aggregate (skip if profile not yet indexed)
    const existingProfile = await context.db.find(profile, { address: voter });
    if (existingProfile) {
      await context.db
        .update(profile, { address: voter })
        .set((row) => ({
          totalRewardsClaimed: row.totalRewardsClaimed + totalPayout,
        }));
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
  "RoundRewardDistributor:SubmitterRewardClaimed",
  async ({ event, context }) => {
    const { contentId, roundId, submitter, crepAmount } = event.args;

    await context.db
      .insert(submitterRewardClaim)
      .values({
        id: `${contentId}-${roundId}`,
        contentId,
        roundId,
        epochId: null,
        source: "round",
        submitter,
        crepAmount,
        claimedAt: event.block.timestamp,
      })
      .onConflictDoNothing();
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
        crepReward: amount,
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
