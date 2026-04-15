import {
  buildSubmitterClaimableRewards,
  buildSubmitterParticipationClaimableRewards,
  buildVoterParticipationClaimableRewards,
  sortClaimableRewardItems,
} from "./claimableRewards";
import assert from "node:assert/strict";
import test from "node:test";

test("buildSubmitterClaimableRewards filters out zero-value and already-claimed rewards", () => {
  const items = buildSubmitterClaimableRewards([
    {
      contentId: 1n,
      roundId: 10n,
      pendingReward: 0n,
      alreadyClaimed: false,
    },
    {
      contentId: 2n,
      roundId: 11n,
      pendingReward: 123n,
      alreadyClaimed: true,
    },
    {
      contentId: 3n,
      roundId: 12n,
      pendingReward: 456n,
      alreadyClaimed: false,
    },
  ]);

  assert.deepEqual(items, [
    {
      contentId: 3n,
      roundId: 12n,
      reward: 456n,
      claimType: "submitter_reward",
    },
  ]);
});

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

test("buildSubmitterParticipationClaimableRewards honors reserved rewards and shared pool depletion", () => {
  const items = buildSubmitterParticipationClaimableRewards(
    [
      {
        contentId: 1n,
        totalReward: 9n,
        alreadyPaid: 0n,
        reservedReward: 4n,
        rewardPool: "0x1000000000000000000000000000000000000000",
      },
      {
        contentId: 2n,
        totalReward: 6n,
        alreadyPaid: 0n,
        reservedReward: 0n,
        rewardPool: "0x1000000000000000000000000000000000000000",
      },
    ],
    new Map([
      [
        "0x1000000000000000000000000000000000000000",
        {
          authorized: true,
          poolBalance: 5n,
        },
      ],
    ]),
  );

  assert.deepEqual(items, [
    {
      contentId: 1n,
      reward: 9n,
      claimType: "submitter_participation_reward",
    },
  ]);
});

test("buildSubmitterParticipationClaimableRewards keeps reserved payouts claimable after deauthorization", () => {
  const items = buildSubmitterParticipationClaimableRewards(
    [
      {
        contentId: 7n,
        totalReward: 9n,
        alreadyPaid: 0n,
        reservedReward: 4n,
        rewardPool: "0x2000000000000000000000000000000000000000",
      },
    ],
    new Map([
      [
        "0x2000000000000000000000000000000000000000",
        {
          authorized: false,
          poolBalance: 10n,
        },
      ],
    ]),
  );

  assert.deepEqual(items, [
    {
      contentId: 7n,
      reward: 4n,
      claimType: "submitter_participation_reward",
    },
  ]);
});

test("buildSubmitterParticipationClaimableRewards applies prior payouts before streaming balance", () => {
  const items = buildSubmitterParticipationClaimableRewards(
    [
      {
        contentId: 9n,
        totalReward: 10n,
        alreadyPaid: 3n,
        reservedReward: 4n,
        rewardPool: "0x2000000000000000000000000000000000000000",
      },
    ],
    new Map([
      [
        "0x2000000000000000000000000000000000000000",
        {
          authorized: true,
          poolBalance: 6n,
        },
      ],
    ]),
  );

  assert.deepEqual(items, [
    {
      contentId: 9n,
      reward: 7n,
      claimType: "submitter_participation_reward",
    },
  ]);
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
