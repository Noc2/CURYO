import assert from "node:assert/strict";
import test from "node:test";
import { getOpenLibraryCoverCandidates } from "~~/lib/content/openLibraryCover";

test("getOpenLibraryCoverCandidates prefers large covers and keeps thumbnails as fallbacks", () => {
  assert.deepEqual(
    getOpenLibraryCoverCandidates({
      coverUrl: "https://covers.openlibrary.org/b/id/9267242-L.jpg",
      thumbnailUrl: "https://covers.openlibrary.org/b/id/9267242-M.jpg",
    }),
    ["https://covers.openlibrary.org/b/id/9267242-L.jpg", "https://covers.openlibrary.org/b/id/9267242-M.jpg"],
  );
});

test("getOpenLibraryCoverCandidates accepts metadata imageUrl and removes duplicates", () => {
  assert.deepEqual(
    getOpenLibraryCoverCandidates({
      imageUrl: "https://covers.openlibrary.org/b/id/14416004-L.jpg",
      thumbnailUrl: "https://covers.openlibrary.org/b/id/14416004-L.jpg",
    }),
    ["https://covers.openlibrary.org/b/id/14416004-L.jpg"],
  );
});

test("getOpenLibraryCoverCandidates drops blank cover urls", () => {
  assert.deepEqual(
    getOpenLibraryCoverCandidates({
      coverUrl: "   ",
      thumbnailUrl: " https://covers.openlibrary.org/b/id/9267242-M.jpg ",
    }),
    ["https://covers.openlibrary.org/b/id/9267242-M.jpg"],
  );
});
