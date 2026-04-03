import assert from "node:assert/strict";
import test from "node:test";
import { getPreferredQueueThumbnailUrl } from "~~/lib/content/thumbnailSource";

test("CoinGecko queue thumbnails prefer the larger image asset when it is available", () => {
  assert.equal(
    getPreferredQueueThumbnailUrl({
      url: "https://www.coingecko.com/en/coins/solana",
      thumbnailUrl: null,
      contentMetadata: {
        thumbnailUrl: "https://assets.coingecko.com/coins/images/4128/small/solana.png?1710000000",
        imageUrl: "https://assets.coingecko.com/coins/images/4128/large/solana.png?1710000000",
      },
    }),
    "https://assets.coingecko.com/coins/images/4128/large/solana.png?1710000000",
  );
});

test("CoinGecko queue thumbnails fall back to the smaller image when no large asset exists", () => {
  assert.equal(
    getPreferredQueueThumbnailUrl({
      url: "https://www.coingecko.com/en/coins/usdc",
      thumbnailUrl: null,
      contentMetadata: {
        thumbnailUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png?1710000000",
      },
    }),
    "https://assets.coingecko.com/coins/images/6319/small/usdc.png?1710000000",
  );
});

test("non-CoinGecko queue thumbnails keep their existing thumbnail preference", () => {
  assert.equal(
    getPreferredQueueThumbnailUrl({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
      contentMetadata: {
        thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        imageUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
      },
    }),
    "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  );
});
