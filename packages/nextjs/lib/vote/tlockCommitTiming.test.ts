import { deriveCommitVoteRuntimeNowMs, deriveCommitVoteTargetTimeSeconds } from "./tlockCommitTiming";
import assert from "node:assert/strict";
import test from "node:test";

test("targets just inside the next reveal window for an open round", () => {
  const params = {
    latestBlockTimestampSeconds: 1_500,
    epochDurationSeconds: 1_200,
    roundStartTimeSeconds: 1_000,
  };

  assert.equal(deriveCommitVoteTargetTimeSeconds(params), 2_201);
  assert.equal(deriveCommitVoteRuntimeNowMs(params), 1_001_000);
});

test("tracks the current epoch when the round is already in a later window", () => {
  const params = {
    latestBlockTimestampSeconds: 2_500,
    epochDurationSeconds: 1_200,
    roundStartTimeSeconds: 1_000,
  };

  assert.equal(deriveCommitVoteTargetTimeSeconds(params), 3_401);
  assert.equal(deriveCommitVoteRuntimeNowMs(params), 2_201_000);
});

test("targets the following epoch when the next block can land on the boundary", () => {
  const params = {
    latestBlockTimestampSeconds: 2_199,
    epochDurationSeconds: 1_200,
    roundStartTimeSeconds: 1_000,
  };

  assert.equal(deriveCommitVoteTargetTimeSeconds(params), 3_401);
  assert.equal(deriveCommitVoteRuntimeNowMs(params), 2_201_000);
});

test("adds a confirmation buffer for the first vote in a new round", () => {
  const params = {
    latestBlockTimestampSeconds: 1_500,
    epochDurationSeconds: 1_200,
  };

  assert.equal(deriveCommitVoteTargetTimeSeconds(params), 2_761);
  assert.equal(deriveCommitVoteRuntimeNowMs(params), 1_561_000);
});

test("caps the new round confirmation buffer below the epoch duration", () => {
  const params = {
    latestBlockTimestampSeconds: 1_500,
    epochDurationSeconds: 30,
  };

  assert.equal(deriveCommitVoteTargetTimeSeconds(params), 1_560);
  assert.equal(deriveCommitVoteRuntimeNowMs(params), 1_530_000);
});
