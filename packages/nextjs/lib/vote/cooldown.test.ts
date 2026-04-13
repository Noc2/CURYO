import { formatVoteCooldownRemaining } from "./cooldown";
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
