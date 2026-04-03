import { buildVoteLocation } from "./location";
import assert from "node:assert/strict";
import test from "node:test";

test("switching categories clears the requested content query param", () => {
  assert.equal(
    buildVoteLocation("https://www.curyo.xyz/vote?content=6&q=openlaw", {
      contentId: null,
      categoryHash: "youtube",
    }),
    "https://www.curyo.xyz/vote?q=openlaw#youtube",
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
