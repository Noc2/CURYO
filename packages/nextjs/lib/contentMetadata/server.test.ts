import { shouldReuseCachedContentMetadata } from "./server";
import assert from "node:assert/strict";
import test from "node:test";

const NOW = Date.parse("2026-04-08T14:45:00Z");

test("shouldReuseCachedContentMetadata refreshes fresh Hugging Face entries that never resolved an image", () => {
  assert.equal(
    shouldReuseCachedContentMetadata(
      "https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK",
      {
        thumbnailUrl: null,
        imageUrl: null,
        fetchedAt: new Date(NOW - 5 * 60 * 1000),
      },
      NOW,
    ),
    false,
  );
});

test("shouldReuseCachedContentMetadata keeps fresh Hugging Face entries once an image is cached", () => {
  assert.equal(
    shouldReuseCachedContentMetadata(
      "https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK",
      {
        thumbnailUrl: "https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png",
        imageUrl: "https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png",
        fetchedAt: new Date(NOW - 5 * 60 * 1000),
      },
      NOW,
    ),
    true,
  );
});

test("shouldReuseCachedContentMetadata still expires entries after the normal TTL", () => {
  assert.equal(
    shouldReuseCachedContentMetadata(
      "https://en.wikipedia.org/wiki/Avatar_(2009_film)",
      {
        thumbnailUrl: "https://upload.wikimedia.org/example.png",
        imageUrl: "https://upload.wikimedia.org/example.png",
        fetchedAt: new Date(NOW - 8 * 24 * 60 * 60 * 1000),
      },
      NOW,
    ),
    false,
  );
});
