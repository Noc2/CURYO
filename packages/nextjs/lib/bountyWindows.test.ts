import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBountyWindowDuration,
  getBountyClosesAt,
  getBountyWindowSeconds,
  parseBountyWindowAmount,
  resolveBountyReferenceNowSeconds,
} from "~~/lib/bountyWindows";

test("getBountyWindowSeconds returns preset and custom durations", () => {
  assert.equal(getBountyWindowSeconds("3h", "9", "days"), 10_800);
  assert.equal(getBountyWindowSeconds("24h", "9", "days"), 86_400);
  assert.equal(getBountyWindowSeconds("7d", "9", "hours"), 604_800);
  assert.equal(getBountyWindowSeconds("custom", "4", "hours"), 14_400);
  assert.equal(getBountyWindowSeconds("custom", "2", "days"), 172_800);
});

test("getBountyWindowSeconds rejects invalid custom durations", () => {
  assert.equal(getBountyWindowSeconds("custom", "0", "hours"), null);
  assert.equal(getBountyWindowSeconds("custom", "-1", "days"), null);
  assert.equal(getBountyWindowSeconds("custom", "abc", "days"), null);
});

test("getBountyClosesAt resolves windows from an explicit timestamp", () => {
  assert.equal(getBountyClosesAt("6h", "1", "days", 1_000), 22_600n);
  assert.equal(getBountyClosesAt("custom", "3", "days", 1_000), 260_200n);
  assert.equal(getBountyClosesAt("custom", "0", "days", 1_000), 0n);
});

test("resolveBountyReferenceNowSeconds prefers the chain timestamp when available", () => {
  assert.equal(resolveBountyReferenceNowSeconds(12_345n, 1_000), 12_345);
  assert.equal(resolveBountyReferenceNowSeconds(54_321, 1_000), 54_321);
  assert.equal(resolveBountyReferenceNowSeconds(undefined, 1_000), 1_000);
});

test("formatBountyWindowDuration keeps compact human labels", () => {
  assert.equal(formatBountyWindowDuration(3 * 60 * 60), "3 hours");
  assert.equal(formatBountyWindowDuration(24 * 60 * 60), "1 day");
  assert.equal(formatBountyWindowDuration(2 * 24 * 60 * 60), "2 days");
  assert.equal(formatBountyWindowDuration(null), "Custom");
});

test("parseBountyWindowAmount floors positive numeric input", () => {
  assert.equal(parseBountyWindowAmount("3.9"), 3);
  assert.equal(parseBountyWindowAmount("abc"), 0);
});
