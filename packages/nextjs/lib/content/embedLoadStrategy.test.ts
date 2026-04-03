import assert from "node:assert/strict";
import test from "node:test";
import { getEmbedImageLoadingProps, shouldWaitForPrefetchedMetadata } from "~~/lib/content/embedLoadStrategy";

test("shouldWaitForPrefetchedMetadata only defers supported metadata-backed embeds", () => {
  assert.equal(shouldWaitForPrefetchedMetadata("github", true, undefined), true);
  assert.equal(shouldWaitForPrefetchedMetadata("youtube", true, undefined), false);
  assert.equal(shouldWaitForPrefetchedMetadata("github", false, undefined), false);
  assert.equal(shouldWaitForPrefetchedMetadata("github", true, { thumbnailUrl: null }), false);
});

test("getEmbedImageLoadingProps prioritizes the primary vote card image", () => {
  assert.deepEqual(getEmbedImageLoadingProps(false), {
    loading: "eager",
    fetchPriority: "high",
    decoding: "async",
  });

  assert.deepEqual(getEmbedImageLoadingProps(true), {
    loading: "lazy",
    fetchPriority: "auto",
    decoding: "async",
  });
});
