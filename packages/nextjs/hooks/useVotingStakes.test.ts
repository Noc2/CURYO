import { getVotingStakesQueryKey } from "./useVotingStakes";
import assert from "node:assert/strict";
import test from "node:test";

test("getVotingStakesQueryKey scopes stake cache entries by chain and wallet", () => {
  assert.deepEqual(getVotingStakesQueryKey("0xAbC", 11142220), ["ponder-fallback", "votingStakes", 11142220, "0xabc"]);
});
