import { buildSubmitterClaimableRewards, buildSubmitterParticipationClaimableRewards } from "./claimableRewards";
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
