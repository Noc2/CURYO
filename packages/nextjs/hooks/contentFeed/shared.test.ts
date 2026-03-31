import assert from "node:assert/strict";
import test from "node:test";
import { isContentSearchQueryTooShort, sortRpcFeed, type ContentItem } from "./shared";

function buildItem(
  id: bigint,
  title: string,
  description: string,
  tags: string[],
  url = `https://example.com/${id.toString()}`,
): ContentItem {
  return {
    id,
    url,
    title,
    description,
    tags,
    submitter: "0x0000000000000000000000000000000000000001",
    contentHash: `hash-${id.toString()}`,
    isOwnContent: false,
    categoryId: 1n,
    rating: 50,
    createdAt: "2026-03-31T00:00:00.000Z",
    lastActivityAt: "2026-03-31T00:00:00.000Z",
    totalVotes: 0,
    totalRounds: 0,
    openRound: null,
    isValidUrl: true,
    thumbnailUrl: null,
  };
}

test("isContentSearchQueryTooShort allows url-like lookups while blocking generic short terms", () => {
  assert.equal(isContentSearchQueryTooShort("ai"), true);
  assert.equal(isContentSearchQueryTooShort("x.com"), false);
  assert.equal(isContentSearchQueryTooShort("https://curyo.xyz"), false);
});

test("sortRpcFeed prioritizes stronger relevance matches for rpc search fallback", () => {
  const feed = [
    buildItem(1n, "Marie Curie notebook", "Archived research notes from an early physics lab", ["science"]),
    buildItem(2n, "Lab archive", "A deep dive into radioactivity research", ["chemistry"]),
    buildItem(3n, "Modern physics", "General notes", ["history"]),
  ];

  const sorted = sortRpcFeed(feed, "relevance", "radioactivity research");

  assert.deepEqual(
    sorted.map(item => item.id),
    [2n, 1n, 3n],
  );
});
