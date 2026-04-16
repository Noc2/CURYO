import {
  buildClaimableQuestionRewardCandidateVoters,
  getClaimableQuestionRewardsQueryKey,
} from "./useClaimableQuestionRewards";
import assert from "node:assert/strict";
import test from "node:test";

test("buildClaimableQuestionRewardCandidateVoters includes linked delegate identities and dedupes them", () => {
  assert.deepEqual(
    buildClaimableQuestionRewardCandidateVoters({
      address: "0xABCDEF0000000000000000000000000000000001",
      delegateTo: "0xabcdef0000000000000000000000000000000002",
      delegateOf: "0xABCDEF0000000000000000000000000000000001",
    }),
    ["0xabcdef0000000000000000000000000000000001", "0xabcdef0000000000000000000000000000000002"],
  );
});

test("getClaimableQuestionRewardsQueryKey keeps linked claim discovery scoped by the full identity set", () => {
  assert.deepEqual(
    getClaimableQuestionRewardsQueryKey(
      ["0xabcdef0000000000000000000000000000000001", "0xabcdef0000000000000000000000000000000002"],
      42220,
    ),
    [
      "claimableQuestionRewards",
      "0xabcdef0000000000000000000000000000000001,0xabcdef0000000000000000000000000000000002",
      42220,
    ],
  );
});
