import { EXECUTIVE_SUMMARY, META, SECTIONS } from "../../scripts/whitepaper/content";
import assert from "node:assert/strict";
import test from "node:test";

test("whitepaper metadata reflects the updated title-case brand deck", () => {
  assert.equal(META.subtitle, "Human Reputation at Stake");
  assert.equal(META.deck, "Get Verified, Claim cREP, and Rate With Stake");
});

test("whitepaper introduction surfaces the updated lead copy", () => {
  assert.equal(SECTIONS[0]?.title, "Introduction");
  assert.equal(SECTIONS[0]?.lead, "Get Verified, Claim cREP, and Rate With Stake");
});

test("whitepaper executive summary preserves the updated brand framing", () => {
  const summaryBlock = EXECUTIVE_SUMMARY[1];

  assert.equal(summaryBlock?.type, "paragraph");
  if (!summaryBlock || summaryBlock.type !== "paragraph") {
    throw new Error("Expected executive summary block to be a paragraph");
  }

  assert.match(summaryBlock.text, /stake-weighted prediction games/i);
  assert.match(summaryBlock.text, /preventing herding/i);
});
