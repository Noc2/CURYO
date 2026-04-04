import assert from "node:assert/strict";
import test from "node:test";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { sortDiscoverFeed } from "~~/lib/vote/feedModes";

function makeContentItem(overrides: Partial<ContentItem> & Pick<ContentItem, "id" | "url" | "title">): ContentItem {
  return {
    id: overrides.id,
    url: overrides.url,
    title: overrides.title,
    description: overrides.description ?? "Example description",
    tags: overrides.tags ?? [],
    submitter: overrides.submitter ?? "0x0000000000000000000000000000000000000001",
    contentHash: overrides.contentHash ?? "0xhash",
    isOwnContent: overrides.isOwnContent ?? false,
    categoryId: overrides.categoryId ?? 1n,
    rating: overrides.rating ?? 50,
    createdAt: overrides.createdAt ?? "1000",
    lastActivityAt: overrides.lastActivityAt ?? overrides.createdAt ?? "1000",
    totalVotes: overrides.totalVotes ?? 0,
    totalRounds: overrides.totalRounds ?? 0,
    openRound: overrides.openRound ?? null,
    isValidUrl: overrides.isValidUrl ?? true,
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    contentMetadata: overrides.contentMetadata,
  };
}

test("trending favors recent, high-activity content", () => {
  const nowSeconds = 10_000;
  const ranked = sortDiscoverFeed(
    [
      makeContentItem({
        id: 1n,
        url: "https://example.com/old",
        title: "Old but quiet",
        createdAt: "100",
        lastActivityAt: "200",
        totalVotes: 2,
        totalRounds: 1,
      }),
      makeContentItem({
        id: 2n,
        url: "https://example.com/busy",
        title: "Busy right now",
        createdAt: "9000",
        lastActivityAt: "9800",
        totalVotes: 24,
        totalRounds: 6,
      }),
    ],
    "trending",
    nowSeconds,
  );

  assert.equal(ranked[0]?.id, 2n);
});

test("contested keeps only items with an open round and ranks close pools first", () => {
  const nowSeconds = 10_000;
  const ranked = sortDiscoverFeed(
    [
      makeContentItem({
        id: 1n,
        url: "https://example.com/close",
        title: "Close split",
        openRound: {
          roundId: 1n,
          voteCount: 6,
          revealedCount: 4,
          totalStake: 120n,
          upPool: 60n,
          downPool: 55n,
          startTime: 9000n,
          estimatedSettlementTime: 10_500n,
        },
      }),
      makeContentItem({
        id: 2n,
        url: "https://example.com/lopsided",
        title: "Lopsided split",
        openRound: {
          roundId: 1n,
          voteCount: 6,
          revealedCount: 4,
          totalStake: 120n,
          upPool: 90n,
          downPool: 20n,
          startTime: 9000n,
          estimatedSettlementTime: 10_500n,
        },
      }),
      makeContentItem({
        id: 3n,
        url: "https://example.com/no-round",
        title: "No round",
      }),
    ],
    "contested",
    nowSeconds,
  );

  assert.deepEqual(
    ranked.map(item => item.id),
    [1n, 2n],
  );
});

test("latest orders submissions by created time", () => {
  const nowSeconds = 10_000;
  const ranked = sortDiscoverFeed(
    [
      makeContentItem({
        id: 1n,
        url: "https://example.com/new",
        title: "Newest post",
        createdAt: "9600",
        lastActivityAt: "9600",
        totalVotes: 20,
        totalRounds: 4,
      }),
      makeContentItem({
        id: 2n,
        url: "https://example.com/old",
        title: "Older established post",
        createdAt: "1000",
        lastActivityAt: "9950",
        totalVotes: 0,
        totalRounds: 0,
      }),
    ],
    "latest",
    nowSeconds,
  );

  assert.equal(ranked[0]?.id, 1n);
});

test("latest breaks created-time ties with the newer id", () => {
  const nowSeconds = 10_000;
  const ranked = sortDiscoverFeed(
    [
      makeContentItem({
        id: 1n,
        url: "https://example.com/first",
        title: "First",
        createdAt: "9600",
        lastActivityAt: "9900",
      }),
      makeContentItem({
        id: 2n,
        url: "https://example.com/second",
        title: "Second",
        createdAt: "9600",
        lastActivityAt: "9600",
      }),
    ],
    "latest",
    nowSeconds,
  );

  assert.deepEqual(
    ranked.map(item => item.id),
    [2n, 1n],
  );
});

test("near settlement favors rounds with sooner estimated settlement", () => {
  const nowSeconds = 10_000;
  const ranked = sortDiscoverFeed(
    [
      makeContentItem({
        id: 1n,
        url: "https://example.com/sooner",
        title: "Sooner",
        openRound: {
          roundId: 1n,
          voteCount: 4,
          revealedCount: 2,
          totalStake: 80n,
          upPool: 30n,
          downPool: 20n,
          startTime: 9800n,
          estimatedSettlementTime: 10_300n,
        },
      }),
      makeContentItem({
        id: 2n,
        url: "https://example.com/later",
        title: "Later",
        openRound: {
          roundId: 1n,
          voteCount: 4,
          revealedCount: 2,
          totalStake: 80n,
          upPool: 30n,
          downPool: 20n,
          startTime: 9800n,
          estimatedSettlementTime: 13_600n,
        },
      }),
    ],
    "near_settlement",
    nowSeconds,
  );

  assert.equal(ranked[0]?.id, 1n);
});
