import { mergeRequestedContentIntoFeed } from "./requestedContent";
import assert from "node:assert/strict";
import test from "node:test";
import type { ContentItem } from "~~/hooks/useContentFeed";

function buildItem(id: bigint): ContentItem {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Item ${id}`,
    description: `Description ${id}`,
    tags: [],
    submitter: "0x0000000000000000000000000000000000000001",
    contentHash: `hash-${id}`,
    isOwnContent: false,
    categoryId: 0n,
    rating: 50,
    createdAt: null,
    lastActivityAt: null,
    totalVotes: 0,
    totalRounds: 0,
    openRound: null,
    isValidUrl: true,
    thumbnailUrl: null,
  };
}

test("mergeRequestedContentIntoFeed preserves the feed when no requested item is present", () => {
  const first = buildItem(1n);
  const second = buildItem(2n);

  assert.deepEqual(
    mergeRequestedContentIntoFeed([first, second], null).map(item => item.id),
    [1n, 2n],
  );
});

test("mergeRequestedContentIntoFeed preserves ranked order when the requested item is already loaded", () => {
  const first = buildItem(1n);
  const second = buildItem(2n);
  const third = buildItem(3n);

  assert.deepEqual(
    mergeRequestedContentIntoFeed([first, second, third], second).map(item => item.id),
    [1n, 2n, 3n],
  );
});

test("mergeRequestedContentIntoFeed prepends a requested item that is missing from the ranked feed", () => {
  const first = buildItem(1n);
  const second = buildItem(2n);
  const requested = buildItem(9n);

  assert.deepEqual(
    mergeRequestedContentIntoFeed([first, second], requested).map(item => item.id),
    [9n, 1n, 2n],
  );
});
