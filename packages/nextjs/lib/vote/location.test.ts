import { buildVoteContentPinKey, buildVoteContentPinKeyFromUrl, buildVoteLocation } from "./location";
import assert from "node:assert/strict";
import test from "node:test";

test("switching categories clears the requested content query param", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/rate?content=6&q=openlaw", {
      contentId: null,
      categoryHash: "youtube",
    }),
    "https://www.curyo.xyz/rate?q=openlaw#youtube",
  );
});

test("switching feed views clears requested content without changing the active route filters", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/rate?content=82&q=ed-sheeran#youtube", {
      contentId: null,
    }),
    "https://www.curyo.xyz/rate?q=ed-sheeran#youtube",
  );
});

test("selecting content preserves the active category hash", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/rate?q=openlaw#youtube", {
      contentId: 9n,
    }),
    "https://www.curyo.xyz/rate?q=openlaw&content=9#youtube",
  );
});

test("content location updates clear social rating version params", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/rate?content=6&rv=r-6-5000-1-0&q=openlaw#youtube", {
      contentId: 9n,
    }),
    "https://www.curyo.xyz/rate?content=9&q=openlaw#youtube",
  );
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/rate?content=6&rv=r-6-5000-1-0&q=openlaw#youtube", {
      contentId: null,
    }),
    "https://www.curyo.xyz/rate?q=openlaw#youtube",
  );
});

test("persisting a selected card adds the content query param to a plain vote url", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/rate", {
      contentId: 12n,
    }),
    "https://www.curyo.xyz/rate?content=12",
  );
});

test("content pin keys normalize query order and ignore hash changes", () => {
  assert.equal(
    buildVoteContentPinKeyFromUrl("https://www.curyo.xyz/rate?q=openlaw&content=6#youtube"),
    "/rate?content=6&q=openlaw",
  );
  assert.equal(
    buildVoteContentPinKeyFromUrl("https://www.curyo.xyz/rate?content=6&q=openlaw#books"),
    "/rate?content=6&q=openlaw",
  );
});

test("content pin keys ignore social rating version params", () => {
  assert.equal(
    buildVoteContentPinKeyFromUrl("https://www.curyo.xyz/rate?rv=r-6-5000-1-0&q=openlaw&content=6#youtube"),
    "/rate?content=6&q=openlaw",
  );
});

test("content pin keys are absent without a content query param", () => {
  assert.equal(buildVoteContentPinKey("/rate", new URLSearchParams("q=openlaw")), null);
});
