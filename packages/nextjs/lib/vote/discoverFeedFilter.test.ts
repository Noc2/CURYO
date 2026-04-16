import assert from "node:assert/strict";
import test from "node:test";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { buildInterestProfile } from "~~/hooks/useInterestProfile";
import { buildFallbackMediaItems } from "~~/lib/contentMedia";
import {
  DISCOVER_ALL_FILTER,
  DISCOVER_BROKEN_FILTER,
  filterDiscoverCategoryItems,
} from "~~/lib/vote/discoverFeedFilter";
import { rankForYouFeed } from "~~/lib/vote/forYouRanker";

function makeContentItem(overrides: Partial<ContentItem> & Pick<ContentItem, "id" | "url" | "title">): ContentItem {
  return {
    id: overrides.id,
    url: overrides.url,
    media: overrides.media ?? buildFallbackMediaItems(overrides.url),
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

test("For You never receives broken links while the default category is active", () => {
  const profile = buildInterestProfile({ feed: [], votes: [] });
  const feed = [
    makeContentItem({
      id: 1n,
      url: "https://example.com/broken",
      title: "Broken but otherwise rankable",
      isValidUrl: false,
      createdAt: "9800",
      lastActivityAt: "9900",
      totalVotes: 24,
      totalRounds: 6,
      openRound: {
        roundId: 1n,
        voteCount: 3,
        revealedCount: 0,
        totalStake: 12n,
        upPool: 7n,
        downPool: 5n,
        startTime: 9800n,
        estimatedSettlementTime: 10_900n,
      },
    }),
    makeContentItem({
      id: 2n,
      url: "https://example.com/healthy",
      title: "Healthy content",
      isValidUrl: true,
      createdAt: "9700",
      lastActivityAt: "9750",
      totalVotes: 1,
      totalRounds: 0,
    }),
  ];

  const filtered = filterDiscoverCategoryItems(feed, DISCOVER_ALL_FILTER);
  const ranked = rankForYouFeed(filtered, {
    nowSeconds: 10_000,
    profile,
    votedContentIds: new Set(),
    watchedContentIds: new Set(),
    followedWallets: new Set(),
  });

  assert.deepEqual(
    ranked.map(item => item.id),
    [2n],
  );
});

test("Broken filter isolates invalid links into the separate feed bucket", () => {
  const feed = [
    makeContentItem({
      id: 1n,
      url: "https://example.com/broken",
      title: "Broken item",
      isValidUrl: false,
    }),
    makeContentItem({
      id: 2n,
      url: "https://example.com/healthy",
      title: "Healthy item",
      isValidUrl: true,
    }),
    makeContentItem({
      id: 3n,
      url: "https://example.com/unknown",
      title: "Unknown validity",
      isValidUrl: null,
    }),
  ];

  const filtered = filterDiscoverCategoryItems(feed, DISCOVER_BROKEN_FILTER);

  assert.deepEqual(
    filtered.map(item => item.id),
    [1n],
  );
});

test("filterDiscoverCategoryItems leaves moderation ownership to the feed layer", () => {
  const feed = [
    makeContentItem({
      id: 1n,
      url: "https://example.com/blocked",
      title: "NSFW title",
      isValidUrl: true,
    }),
    makeContentItem({
      id: 2n,
      url: "https://example.com/healthy",
      title: "Healthy item",
      isValidUrl: true,
    }),
  ];

  assert.deepEqual(
    filterDiscoverCategoryItems(feed, DISCOVER_ALL_FILTER).map(item => item.id),
    [1n, 2n],
  );
});
