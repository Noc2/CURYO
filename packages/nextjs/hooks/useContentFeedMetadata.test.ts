import assert from "node:assert/strict";
import test from "node:test";
import { type ContentItem, mapContentItem, mergeContentFeedMetadata } from "~~/hooks/contentFeed/shared";
import {
  getContentFeedMetadataCacheKey,
  getContentFeedMetadataUrls,
  getGenericValidationMap,
  isContentFeedMetadataPrefetchPending,
} from "~~/hooks/useContentFeedMetadata";
import { buildFallbackMediaItems } from "~~/lib/contentMedia";

function makeContentItem(overrides: Partial<ContentItem> & Pick<ContentItem, "id" | "url">): ContentItem {
  return {
    id: overrides.id,
    url: overrides.url,
    media: overrides.media ?? buildFallbackMediaItems(overrides.url),
    title: overrides.title ?? "Example title",
    description: overrides.description ?? "Example description",
    tags: overrides.tags ?? [],
    submitter: overrides.submitter ?? "0x0000000000000000000000000000000000000001",
    contentHash: overrides.contentHash ?? "0xhash",
    isOwnContent: overrides.isOwnContent ?? false,
    categoryId: overrides.categoryId ?? 1n,
    rating: overrides.rating ?? 50,
    createdAt: overrides.createdAt ?? null,
    lastActivityAt: overrides.lastActivityAt ?? null,
    totalVotes: overrides.totalVotes ?? 0,
    totalRounds: overrides.totalRounds ?? 0,
    openRound: overrides.openRound ?? null,
    isValidUrl: overrides.isValidUrl ?? null,
    thumbnailUrl: overrides.thumbnailUrl ?? null,
    contentMetadata: overrides.contentMetadata,
  };
}

test("getContentFeedMetadataCacheKey stays stable when the feed order changes", () => {
  const firstFeed = [
    makeContentItem({ id: 1n, url: "https://example.com/b.jpg" }),
    makeContentItem({ id: 2n, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    makeContentItem({ id: 3n, url: "https://example.com/b.jpg" }),
    makeContentItem({ id: 6n, url: "" }),
  ];
  const secondFeed = [
    makeContentItem({ id: 4n, url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }),
    makeContentItem({ id: 5n, url: "https://example.com/b.jpg" }),
  ];

  assert.deepEqual(getContentFeedMetadataUrls(firstFeed), [
    "https://example.com/b.jpg",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  ]);
  assert.equal(
    getContentFeedMetadataCacheKey(getContentFeedMetadataUrls(firstFeed)),
    getContentFeedMetadataCacheKey(getContentFeedMetadataUrls(secondFeed)),
  );
});

test("getGenericValidationMap leaves generic context links validatable by metadata", () => {
  const genericUrl = "https://example.com/articles/security";
  const platformUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  assert.deepEqual(getGenericValidationMap([genericUrl, platformUrl]), {});
});

test("mergeContentFeedMetadata adds rich metadata without dropping the existing thumbnail fallback", () => {
  const url = "https://example.com/bitcoin.jpg";
  const [merged] = mergeContentFeedMetadata(
    [makeContentItem({ id: 1n, url, thumbnailUrl: "https://img.youtube.com/fallback.jpg" })],
    {
      [url]: {
        thumbnailUrl: null,
      },
    },
    { [url]: false },
  );

  assert.equal(merged.thumbnailUrl, "https://img.youtube.com/fallback.jpg");
  assert.equal(merged.isValidUrl, false);
});

test("mergeContentFeedMetadata preserves prior metadata when a later refresh omits the url", () => {
  const url = "https://example.com/openai-node.jpg";
  const [enriched] = mergeContentFeedMetadata(
    [makeContentItem({ id: 1n, url })],
    {
      [url]: {
        thumbnailUrl: "https://example.com/openai-node.jpg",
      },
    },
    {},
  );

  const [preserved] = mergeContentFeedMetadata([enriched], {}, {});
  assert.equal(preserved.thumbnailUrl, "https://example.com/openai-node.jpg");
});

test("isContentFeedMetadataPrefetchPending only defers embeds while thumbnail batches are unresolved", () => {
  const urls = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ"];

  assert.equal(isContentFeedMetadataPrefetchPending(urls, undefined), true);
  assert.equal(isContentFeedMetadataPrefetchPending(urls, {}), true);
  assert.equal(isContentFeedMetadataPrefetchPending(urls, { [urls[0]]: { thumbnailUrl: null } }), false);
});

test("isContentFeedMetadataPrefetchPending stays pending when only part of the next feed is enriched", () => {
  const urls = ["https://example.com/openai-node.jpg", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"];

  assert.equal(
    isContentFeedMetadataPrefetchPending(urls, {
      [urls[0]]: {
        thumbnailUrl: "https://example.com/openai-node.jpg",
      },
    }),
    true,
  );
});

test("mapContentItem preserves open-round directional vote counts", () => {
  const mapped = mapContentItem({
    id: "1",
    url: "https://example.com/content",
    title: "Example title",
    description: "Example description",
    tags: "",
    submitter: "0x0000000000000000000000000000000000000001",
    contentHash: "0xhash",
    categoryId: "1",
    rating: 50,
    openRound: {
      roundId: "3",
      voteCount: 1,
      revealedCount: 1,
      totalStake: "100000000",
      upPool: "100000000",
      downPool: "0",
      upCount: 1,
      downCount: 0,
      startTime: "1000",
      estimatedSettlementTime: "4600",
    },
  });

  assert.equal(mapped.openRound?.upCount, 1);
  assert.equal(mapped.openRound?.downCount, 0);
});
