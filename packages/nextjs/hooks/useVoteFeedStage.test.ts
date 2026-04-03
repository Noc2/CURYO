import { resolveVoteFeedActiveSourceIndex } from "./useVoteFeedStage";
import assert from "node:assert/strict";
import test from "node:test";

const items = [{ id: 1n }, { id: 2n }, { id: 3n }];

test("selects the requested content once it is present in the feed", () => {
  assert.equal(resolveVoteFeedActiveSourceIndex(items, null, 3n), 2);
});

test("does not fall back to the first item while a requested deep-link item is still missing", () => {
  assert.equal(resolveVoteFeedActiveSourceIndex(items, null, 9n), -1);
});

test("falls back to the first item when there is no explicit requested selection", () => {
  assert.equal(resolveVoteFeedActiveSourceIndex(items, 9n, null), 0);
});

test("returns no active item when the feed is empty", () => {
  assert.equal(resolveVoteFeedActiveSourceIndex([], null, 3n), -1);
});
