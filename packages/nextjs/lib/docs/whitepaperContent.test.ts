import assert from "node:assert/strict";
import test from "node:test";
import { EXECUTIVE_SUMMARY, META, SECTIONS } from "../../scripts/whitepaper/content";

test("whitepaper metadata reflects the updated title-case brand deck", () => {
  assert.equal(META.subtitle, "Human Reputation at Stake");
  assert.equal(META.deck, "Stake-Weighted Ratings From Verified Humans.");
});

test("whitepaper introduction surfaces the updated lead copy", () => {
  assert.equal(SECTIONS[0]?.title, "Introduction");
  assert.equal(SECTIONS[0]?.lead, "Stake-Weighted Ratings From Verified Humans.");
});

test("whitepaper executive summary preserves the updated brand framing", () => {
  assert.match(EXECUTIVE_SUMMARY[1]?.text ?? "", /stake-weighted prediction games/i);
  assert.match(EXECUTIVE_SUMMARY[1]?.text ?? "", /preventing herding/i);
});
