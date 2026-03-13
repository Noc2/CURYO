import assert from "node:assert/strict";
import test from "node:test";
import { type ContentItem, mergeContentFeedMetadata } from "~~/hooks/contentFeed/shared";
import { getContentFeedMetadataCacheKey, getContentFeedMetadataUrls } from "~~/hooks/useContentFeedMetadata";

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
