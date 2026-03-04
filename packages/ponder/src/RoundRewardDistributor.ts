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
    const { contentId, roundId, voter, stakeReturned, crepReward } =
      event.args;

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
        crepReward,
        claimedAt: event.block.timestamp,
      })
      .onConflictDoNothing();

    // Update profile aggregate (skip if profile not yet indexed)
    const existingProfile = await context.db.find(profile, { address: voter });
    if (existingProfile) {
      await context.db
        .update(profile, { address: voter })
        .set((row) => ({
          totalRewardsClaimed: row.totalRewardsClaimed + crepReward,
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
        totalRewardsClaimed: crepReward,
        totalProfiles: 0,
        totalVoterIds: 0,
      })
      .onConflictDoUpdate((row) => ({
        totalRewardsClaimed: row.totalRewardsClaimed + crepReward,
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
