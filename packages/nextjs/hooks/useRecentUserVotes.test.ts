import { getRecentUserVotesQueryKey } from "./useRecentUserVotes";
import assert from "node:assert/strict";
import test from "node:test";

test("getRecentUserVotesQueryKey scopes cache entries by chain", () => {
  assert.deepEqual(getRecentUserVotesQueryKey("0xabc", 11142220), [
    "ponder-fallback",
    "recentUserVotes",
    11142220,
    "0xabc",
  ]);
  assert.deepEqual(getRecentUserVotesQueryKey("0xabc"), ["ponder-fallback", "recentUserVotes", "unknown", "0xabc"]);
});
