import {
  type ContentItem,
  filterModeratedContentItems,
  filterRpcFeed,
  isContentSearchQueryTooShort,
  mapContentItem,
  sortRpcFeed,
} from "./shared";
import assert from "node:assert/strict";
import test from "node:test";

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

test("filterModeratedContentItems removes content blocked by the frontend policy", () => {
  const feed = [
    buildItem(1n, "Normal title", "Normal description", ["science"]),
    buildItem(2n, "NSFW title", "Normal description", ["art"]),
  ];

  assert.deepEqual(
    filterModeratedContentItems(feed).map(item => item.id),
    [1n],
  );
});

test("mapContentItem marks linked submitter addresses as own content", () => {
  const item = mapContentItem(
    {
      id: "1",
      url: "https://example.com/1",
      title: "Delegated submission",
      description: "Submitted through a linked voter wallet",
      tags: "",
      submitter: "0x00000000000000000000000000000000000000aa",
      contentHash: "hash-1",
      categoryId: "1",
      rating: 50,
    },
    "0x0000000000000000000000000000000000000001",
    ["0x00000000000000000000000000000000000000aa"],
  );

  assert.equal(item.isOwnContent, true);
});

test("mapContentItem supports text-only questions and Ponder reward pool summaries", () => {
  const item = mapContentItem({
    id: "2",
    url: null,
    title: "Would you book this hotel?",
    description: "Assume a weekend stay with a family.",
    tags: "Hotels,Value",
    submitter: "0x00000000000000000000000000000000000000aa",
    contentHash: "hash-2",
    categoryId: "2",
    rating: 50,
    rewardPoolSummary: {
      totalFundedAmount: "25000000",
      currentRewardPoolAmount: "18000000",
      activeRewardPoolCount: 1,
    },
  });

  assert.equal(item.url, "");
  assert.equal(item.rewardPoolSummary?.totalFunded, 25_000_000n);
  assert.equal(item.rewardPoolSummary?.totalAvailable, 18_000_000n);
  assert.equal(item.rewardPoolSummary?.activeRewardPoolCount, 1);
});

test("filterRpcFeed matches any address in the submitters filter", () => {
  const matching = {
    ...buildItem(1n, "Delegated", "Bot-submitted content", []),
    submitter: "0x00000000000000000000000000000000000000aa",
  };
  const ignored = {
    ...buildItem(2n, "Other", "Other content", []),
    submitter: "0x00000000000000000000000000000000000000bb",
  };

  assert.deepEqual(
    filterRpcFeed([matching, ignored], {
      submitters: ["0x0000000000000000000000000000000000000001", "0x00000000000000000000000000000000000000aa"],
    }).map(item => item.id),
    [1n],
  );
});
