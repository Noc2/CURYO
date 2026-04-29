import { buildVoterParticipationClaimableRewards, sortClaimableRewardItems } from "./claimableRewards";
import assert from "node:assert/strict";
import test from "node:test";

test("buildVoterParticipationClaimableRewards surfaces partially reserved winning-voter rewards", () => {
  const items = buildVoterParticipationClaimableRewards([
    {
      contentId: 4n,
      roundId: 2n,
      stake: 10_000_000n,
      rateBps: 9000n,
      totalReward: 18_000_000n,
      reservedReward: 9_000_000n,
      alreadyPaid: 2_000_000n,
      rewardPool: "0x4000000000000000000000000000000000000000",
      alreadyClaimed: false,
    },
  ]);

  assert.deepEqual(items, [
    {
      contentId: 4n,
      roundId: 2n,
      reward: 2_500_000n,
      claimType: "participation_reward",
    },
  ]);
});

test("buildVoterParticipationClaimableRewards skips already claimed or unbacked rewards", () => {
  const items = buildVoterParticipationClaimableRewards([
    {
      contentId: 4n,
      roundId: 2n,
      stake: 10_000_000n,
      rateBps: 9000n,
      totalReward: 18_000_000n,
      reservedReward: 18_000_000n,
      alreadyPaid: 0n,
      rewardPool: "0x4000000000000000000000000000000000000000",
      alreadyClaimed: true,
    },
    {
      contentId: 5n,
      roundId: 2n,
      stake: 10_000_000n,
      rateBps: 9000n,
      totalReward: 18_000_000n,
      reservedReward: 0n,
      alreadyPaid: 0n,
      rewardPool: "0x4000000000000000000000000000000000000000",
      alreadyClaimed: false,
    },
  ]);

  assert.deepEqual(items, []);
});

test("sortClaimableRewardItems keeps frontend round credits ahead of the final frontend withdrawal", () => {
  const items = sortClaimableRewardItems([
    {
      frontend: "0x3000000000000000000000000000000000000000",
      reward: 5n,
      claimType: "frontend_registry_fee",
    },
    {
      contentId: 8n,
      roundId: 2n,
      frontend: "0x3000000000000000000000000000000000000000",
      reward: 3n,
      claimType: "frontend_round_fee",
    },
    {
      rewardPoolId: 9n,
      contentId: 5n,
      roundId: 1n,
      reward: 2n,
      title: "Is this worth it?",
      claimType: "question_reward",
    },
    {
      contentId: 2n,
      roundId: 1n,
      reward: 4n,
      claimType: "reward",
    },
    {
      contentId: 2n,
      roundId: 1n,
      reward: 1n,
      claimType: "participation_reward",
    },
  ]);

  assert.deepEqual(items, [
    {
      contentId: 2n,
      roundId: 1n,
      reward: 4n,
      claimType: "reward",
    },
    {
      contentId: 2n,
      roundId: 1n,
      reward: 1n,
      claimType: "participation_reward",
    },
    {
      rewardPoolId: 9n,
      contentId: 5n,
      roundId: 1n,
      reward: 2n,
      title: "Is this worth it?",
      claimType: "question_reward",
    },
    {
      contentId: 8n,
      roundId: 2n,
      frontend: "0x3000000000000000000000000000000000000000",
      reward: 3n,
      claimType: "frontend_round_fee",
    },
    {
      frontend: "0x3000000000000000000000000000000000000000",
      reward: 5n,
      claimType: "frontend_registry_fee",
    },
  ]);
});
