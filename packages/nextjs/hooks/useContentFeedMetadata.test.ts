import assert from "node:assert/strict";
import test from "node:test";
import { type ContentItem, mapContentItem, mergeContentFeedMetadata } from "~~/hooks/contentFeed/shared";
import {
  getContentFeedMetadataCacheKey,
  getContentFeedMetadataUrls,
  getContentFeedValidationUrls,
  getGenericValidationMap,
  isContentFeedMetadataPrefetchPending,
  normalizeValidationBatchResults,
} from "~~/hooks/useContentFeedMetadata";

function makeContentItem(overrides: Partial<ContentItem> & Pick<ContentItem, "id" | "url">): ContentItem {
  return {
    id: overrides.id,
    url: overrides.url,
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
    makeContentItem({ id: 1n, url: "https://example.com/b" }),
    makeContentItem({ id: 2n, url: "https://example.com/a" }),
    makeContentItem({ id: 3n, url: "https://example.com/b" }),
  ];
  const secondFeed = [
    makeContentItem({ id: 4n, url: "https://example.com/a" }),
    makeContentItem({ id: 5n, url: "https://example.com/b" }),
  ];

  assert.deepEqual(getContentFeedMetadataUrls(firstFeed), ["https://example.com/a", "https://example.com/b"]);
  assert.equal(
    getContentFeedMetadataCacheKey(getContentFeedMetadataUrls(firstFeed)),
    getContentFeedMetadataCacheKey(getContentFeedMetadataUrls(secondFeed)),
  );
});

test("getContentFeedValidationUrls skips generic URLs before live validation", () => {
  const genericUrl = "https://example.com/articles/security";
  const youtubeUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
  const wikipediaUrl = "https://en.wikipedia.org/wiki/Bitcoin";

  assert.deepEqual(getContentFeedValidationUrls([genericUrl, youtubeUrl, wikipediaUrl]), [youtubeUrl, wikipediaUrl]);
});

test("getGenericValidationMap keeps generic URLs broken without an API round-trip", () => {
  const genericUrl = "https://example.com/articles/security";
  const platformUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  assert.deepEqual(getGenericValidationMap([genericUrl, platformUrl]), {
    [genericUrl]: false,
  });
});

test("mergeContentFeedMetadata adds rich metadata without dropping the existing thumbnail fallback", () => {
  const url = "https://en.wikipedia.org/wiki/Bitcoin";
  const [merged] = mergeContentFeedMetadata(
    [makeContentItem({ id: 1n, url, thumbnailUrl: "https://img.youtube.com/fallback.jpg" })],
    {
      [url]: {
        thumbnailUrl: null,
        title: "Bitcoin",
        description: "Peer-to-peer electronic cash",
      },
    },
    { [url]: false },
  );

  assert.equal(merged.thumbnailUrl, "https://img.youtube.com/fallback.jpg");
  assert.equal(merged.contentMetadata?.title, "Bitcoin");
  assert.equal(merged.isValidUrl, false);
});

test("mergeContentFeedMetadata preserves prior metadata when a later refresh omits the url", () => {
  const url = "https://github.com/openai/openai-node";
  const [enriched] = mergeContentFeedMetadata(
    [makeContentItem({ id: 1n, url })],
    {
      [url]: {
        thumbnailUrl: "https://avatars.githubusercontent.com/u/14957082?v=4",
        title: "openai/openai-node",
      },
    },
    {},
  );

  const [preserved] = mergeContentFeedMetadata([enriched], {}, {});
  assert.equal(preserved.contentMetadata?.title, "openai/openai-node");
  assert.equal(preserved.thumbnailUrl, "https://avatars.githubusercontent.com/u/14957082?v=4");
});

test("normalizeValidationBatchResults marks generic urls as broken when the API leaves them unvalidated", () => {
  const genericUrl = "https://example.com/articles/security";
  const platformUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  assert.deepEqual(
    normalizeValidationBatchResults([genericUrl, platformUrl], {
      [platformUrl]: { isValid: true },
    }),
    {
      [genericUrl]: false,
      [platformUrl]: true,
    },
  );
});

test("normalizeValidationBatchResults leaves omitted supported platforms unresolved", () => {
  const platformUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

  assert.deepEqual(normalizeValidationBatchResults([platformUrl], {}), {});
});

test("isContentFeedMetadataPrefetchPending only defers embeds while thumbnail batches are unresolved", () => {
  const urls = ["https://github.com/openai/openai-node"];

  assert.equal(isContentFeedMetadataPrefetchPending(urls, undefined), true);
  assert.equal(isContentFeedMetadataPrefetchPending(urls, {}), true);
  assert.equal(isContentFeedMetadataPrefetchPending(urls, { [urls[0]]: { thumbnailUrl: null } }), false);
});

test("isContentFeedMetadataPrefetchPending stays pending when only part of the next feed is enriched", () => {
  const urls = ["https://github.com/openai/openai-node", "https://rawg.io/games/portal-2"];

  assert.equal(
    isContentFeedMetadataPrefetchPending(urls, {
      [urls[0]]: {
        thumbnailUrl: "https://avatars.githubusercontent.com/u/14957082?v=4",
        title: "openai/openai-node",
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
