import {
  formatVoteCooldownRemaining,
  getVoteCommittedSeconds,
  getVoteCooldownRemainingSeconds,
  normalizeVoteCommittedAt,
} from "./cooldown";
import assert from "node:assert/strict";
import test from "node:test";

test("formatVoteCooldownRemaining does not round a near-day cooldown up to one day", () => {
  assert.equal(formatVoteCooldownRemaining(24 * 60 * 60 - 1), "23h 59m");
});

test("formatVoteCooldownRemaining keeps exact hours readable", () => {
  assert.equal(formatVoteCooldownRemaining(24 * 60 * 60), "24h 0m");
  assert.equal(formatVoteCooldownRemaining(23 * 60 * 60), "23h 0m");
});

test("formatVoteCooldownRemaining uses minutes below one hour", () => {
  assert.equal(formatVoteCooldownRemaining(59), "less than a minute");
  assert.equal(formatVoteCooldownRemaining(60), "1m");
  assert.equal(formatVoteCooldownRemaining(59 * 60 + 59), "59m");
});

test("getVoteCooldownRemainingSeconds accepts indexed Unix-second timestamps", () => {
  const committedAt = "1710000000";
  const nowSeconds = 1710000000 + 60 * 60;

  assert.equal(getVoteCommittedSeconds(committedAt), 1710000000);
  assert.equal(getVoteCooldownRemainingSeconds(committedAt, nowSeconds), 23 * 60 * 60);
});

test("normalizeVoteCommittedAt converts numeric timestamps to ISO strings", () => {
  assert.equal(normalizeVoteCommittedAt("1710000000"), "2024-03-09T16:00:00.000Z");
  assert.equal(normalizeVoteCommittedAt("2024-03-09T16:00:00.000Z"), "2024-03-09T16:00:00.000Z");
  assert.equal(normalizeVoteCommittedAt("not-a-date"), null);
});
