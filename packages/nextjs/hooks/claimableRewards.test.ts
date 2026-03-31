import { buildSubmitterClaimableRewards } from "./claimableRewards";
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
