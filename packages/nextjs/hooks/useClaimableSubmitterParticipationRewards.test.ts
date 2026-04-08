import { getClaimableSubmitterParticipationRewardsQueryKey } from "./useClaimableSubmitterParticipationRewards";
import assert from "node:assert/strict";
import test from "node:test";

test("claimable submitter participation reward query keys include the target chain", () => {
  const address = "0xAbC1230000000000000000000000000000000000";

  assert.deepEqual(getClaimableSubmitterParticipationRewardsQueryKey(address, 42220), [
    "claimableSubmitterParticipationRewards",
    "0xabc1230000000000000000000000000000000000",
    42220,
  ]);

  assert.notDeepEqual(
    getClaimableSubmitterParticipationRewardsQueryKey(address, 42220),
    getClaimableSubmitterParticipationRewardsQueryKey(address, 11142220),
  );
});
