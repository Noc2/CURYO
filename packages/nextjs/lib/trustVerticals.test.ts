import {
  buildTrustVerticalTag,
  extractTrustVerticalFromTags,
  isTrustVerticalSlug,
  mergeTrustVerticalTag,
  resolveTrustVerticalSlug,
  stripTrustVerticalTags,
} from "@curyo/node-utils/trustVerticals";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveTrustVerticalSlug prefers explicit vertical tags", () => {
  assert.equal(
    resolveTrustVerticalSlug({
      categoryId: 1n,
      tags: ["Featured", "vertical:software"],
    }),
    "software",
  );
});

test("resolveTrustVerticalSlug maps legacy categories and domains", () => {
  assert.equal(resolveTrustVerticalSlug({ categoryId: 9n }), "investment");
  assert.equal(resolveTrustVerticalSlug({ categoryName: "GitHub Repos" }), "software");
  assert.equal(resolveTrustVerticalSlug({ categoryName: "Tweets" }), "entertainment");
  assert.equal(resolveTrustVerticalSlug({ url: "https://www.coingecko.com/en/coins/bitcoin" }), "investment");
});

test("news is not a trust vertical", () => {
  assert.equal(isTrustVerticalSlug("news"), false);
  assert.equal(extractTrustVerticalFromTags("vertical:news"), null);
});

test("vertical tags are reserved system tags", () => {
  assert.equal(buildTrustVerticalTag("health"), "vertical:health");
  assert.equal(extractTrustVerticalFromTags("wellness, vertical:health"), "health");
  assert.deepEqual(stripTrustVerticalTags(["wellness", "vertical:health"]), ["wellness"]);
  assert.deepEqual(stripTrustVerticalTags(["claim", "vertical:news"]), ["claim"]);
  assert.deepEqual(mergeTrustVerticalTag(["vertical:news", "claim"], "investment"), ["claim", "vertical:investment"]);
});
