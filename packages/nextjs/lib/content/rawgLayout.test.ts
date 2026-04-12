import { shouldFillRawgMediaSurface } from "./rawgLayout";
import assert from "node:assert/strict";
import test from "node:test";

test("compact RAWG embeds keep their thumbnail card sizing by default", () => {
  assert.equal(shouldFillRawgMediaSurface(true), false);
});

test("vote-mode compact RAWG embeds fill the available media surface", () => {
  assert.equal(shouldFillRawgMediaSurface(true, true), true);
});

test("non-compact RAWG embeds fill the available media surface", () => {
  assert.equal(shouldFillRawgMediaSurface(false), true);
});
