import { getClaimableSubmitterRewardsQueryKey } from "./useClaimableSubmitterRewards";
import assert from "node:assert/strict";
import test from "node:test";

test("claimable submitter reward query keys include the target chain", () => {
  const address = "0xAbC1230000000000000000000000000000000000";

  assert.deepEqual(getClaimableSubmitterRewardsQueryKey(address, 42220), [
    "claimableSubmitterRewards",
    "0xabc1230000000000000000000000000000000000",
    42220,
  ]);

  assert.notDeepEqual(
    getClaimableSubmitterRewardsQueryKey(address, 42220),
    getClaimableSubmitterRewardsQueryKey(address, 11142220),
  );
});
