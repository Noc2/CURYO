import {
  resolveVoteFeedActiveContentIdForSessionChange,
  resolveVoteFeedActiveSourceIndex,
  resolveVoteFeedVisibleRange,
} from "./useVoteFeedStage";
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

test("resets the active item when the feed session changes without a requested item", () => {
  assert.equal(
    resolveVoteFeedActiveContentIdForSessionChange(3n, "search:ed sheeran:newest", "search:ed sheeran:oldest", null),
    null,
  );
});

test("keeps requested content selected across feed session changes", () => {
  assert.equal(
    resolveVoteFeedActiveContentIdForSessionChange(3n, "search:ed sheeran:newest", "search:ed sheeran:oldest", 7n),
    7n,
  );
});

test("keeps the active item within the same feed session", () => {
  assert.equal(
    resolveVoteFeedActiveContentIdForSessionChange(3n, "search:ed sheeran:newest", "search:ed sheeran:newest", null),
    3n,
  );
});

test("resolveVoteFeedVisibleRange centers the desktop render window around the active card when possible", () => {
  assert.deepEqual(resolveVoteFeedVisibleRange(20, 7, 12, 5), {
    start: 5,
    end: 10,
  });
});

test("resolveVoteFeedVisibleRange clamps to the loaded items when fewer cards are available than the desktop window", () => {
  assert.deepEqual(resolveVoteFeedVisibleRange(20, 4, 3, 5), {
    start: 0,
    end: 3,
  });
});

test("resolveVoteFeedVisibleRange clamps to the loaded edge when the active card is near the end", () => {
  assert.deepEqual(resolveVoteFeedVisibleRange(20, 11, 12, 5), {
    start: 7,
    end: 12,
  });
});

test("resolveVoteFeedVisibleRange clamps back to the first loaded card when the active index is before the feed", () => {
  assert.deepEqual(resolveVoteFeedVisibleRange(20, -3, 12, 5), {
    start: 0,
    end: 5,
  });
});
