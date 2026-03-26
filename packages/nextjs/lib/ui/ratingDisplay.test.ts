import {
  clampContentRating,
  formatCommunityRatingAriaLabel,
  formatRatingOutOfTen,
  formatRatingScoreOutOfTen,
} from "./ratingDisplay";
import assert from "node:assert/strict";
import test from "node:test";

test("clampContentRating keeps values in the 0-100 range", () => {
  assert.equal(clampContentRating(-12), 0);
  assert.equal(clampContentRating(50), 50);
  assert.equal(clampContentRating(128), 100);
});

test("clampContentRating treats non-finite values as zero", () => {
  assert.equal(clampContentRating(Number.NaN), 0);
  assert.equal(clampContentRating(Number.POSITIVE_INFINITY), 0);
});

test("formatRatingScoreOutOfTen converts ratings to one decimal place", () => {
  assert.equal(formatRatingScoreOutOfTen(0), "0.0");
  assert.equal(formatRatingScoreOutOfTen(50), "5.0");
  assert.equal(formatRatingScoreOutOfTen(83), "8.3");
  assert.equal(formatRatingScoreOutOfTen(100), "10.0");
});

test("formatRatingOutOfTen appends the shared suffix", () => {
  assert.equal(formatRatingOutOfTen(50), "5.0/10");
});

test("formatCommunityRatingAriaLabel returns a screen-reader friendly label", () => {
  assert.equal(formatCommunityRatingAriaLabel(50), "Community rating 5.0 out of 10");
});
