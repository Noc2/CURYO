import { resolveContentMetadata } from "./server";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveContentMetadata returns direct image URLs without fetching metadata", async () => {
  assert.deepEqual(await resolveContentMetadata("https://example.com/photo.webp?size=large"), {
    thumbnailUrl: "https://example.com/photo.webp?size=large",
  });
});
