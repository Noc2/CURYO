import assert from "node:assert/strict";
import test from "node:test";
import { computeVoteProgressIconCounts } from "~~/lib/vote/voteProgressIcons";

test("computeVoteProgressIconCounts fills icons from committed votes", () => {
  const counts = computeVoteProgressIconCounts({
    voteCount: 3,
    minVoters: 3,
  });

  assert.deepEqual(counts, { filled: 3, empty: 0 });
});

test("computeVoteProgressIconCounts keeps empty icons until the threshold is reached", () => {
  const counts = computeVoteProgressIconCounts({
    voteCount: 1,
    minVoters: 3,
  });

  assert.deepEqual(counts, { filled: 1, empty: 2 });
});

test("computeVoteProgressIconCounts caps the rendered row at seven icons", () => {
  const counts = computeVoteProgressIconCounts({
    voteCount: 8,
    minVoters: 3,
  });

  assert.deepEqual(counts, { filled: 7, empty: 0 });
});
