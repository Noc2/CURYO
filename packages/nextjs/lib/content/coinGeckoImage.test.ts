import assert from "node:assert/strict";
import test from "node:test";
import { getCoinGeckoImageCandidates, getImageLoadState } from "~~/lib/content/coinGeckoImage";

test("getCoinGeckoImageCandidates prefers the large asset and keeps a smaller fallback", () => {
  assert.deepEqual(
    getCoinGeckoImageCandidates({
      imageUrl: "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409",
      thumbnailUrl: "https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png?1696501409",
    }),
    [
      "https://coin-images.coingecko.com/coins/images/5/large/dogecoin.png?1696501409",
      "https://coin-images.coingecko.com/coins/images/5/small/dogecoin.png?1696501409",
    ],
  );
});

test("getCoinGeckoImageCandidates removes duplicate image urls", () => {
  assert.deepEqual(
    getCoinGeckoImageCandidates({
      imageUrl: "https://coin-images.coingecko.com/coins/images/3408/large/usdc.png",
      thumbnailUrl: "https://coin-images.coingecko.com/coins/images/3408/large/usdc.png",
    }),
    ["https://coin-images.coingecko.com/coins/images/3408/large/usdc.png"],
  );
});

test("getCoinGeckoImageCandidates drops blank urls after trimming", () => {
  assert.deepEqual(
    getCoinGeckoImageCandidates({
      imageUrl: "   ",
      thumbnailUrl: " https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png ",
    }),
    ["https://coin-images.coingecko.com/coins/images/1/small/bitcoin.png"],
  );
});

test("getImageLoadState detects cached, pending, and failed image loads", () => {
  assert.equal(getImageLoadState(null), "pending");
  assert.equal(getImageLoadState({ complete: false, naturalWidth: 0 }), "pending");
  assert.equal(getImageLoadState({ complete: true, naturalWidth: 192 }), "loaded");
  assert.equal(getImageLoadState({ complete: true, naturalWidth: 0 }), "error");
});
