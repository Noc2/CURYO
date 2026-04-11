import { buildVoteLocation } from "./location";
import assert from "node:assert/strict";
import test from "node:test";

test("switching categories preserves the requested content query param when the pin is still active", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/vote?content=6&q=openlaw", {
      categoryHash: "youtube",
    }),
    "https://www.curyo.xyz/vote?content=6&q=openlaw#youtube",
  );
});

test("category changes can still explicitly clear the requested content query param", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/vote?content=6&q=openlaw", {
      contentId: null,
      categoryHash: "youtube",
    }),
    "https://www.curyo.xyz/vote?q=openlaw#youtube",
  );
});

test("switching feed views clears requested content without changing the active route filters", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/vote?content=82&q=ed-sheeran#youtube", {
      contentId: null,
    }),
    "https://www.curyo.xyz/vote?q=ed-sheeran#youtube",
  );
});

test("selecting content preserves the active category hash", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/vote?q=openlaw#youtube", {
      contentId: 9n,
    }),
    "https://www.curyo.xyz/vote?q=openlaw&content=9#youtube",
  );
});

test("persisting a selected card adds the content query param to a plain vote url", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/vote", {
      contentId: 12n,
    }),
    "https://www.curyo.xyz/vote?content=12",
  );
});
