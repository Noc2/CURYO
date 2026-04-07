import assert from "node:assert/strict";
import test from "node:test";
import { stabilizeSessionFeedOrder } from "~~/lib/vote/stableFeedOrder";

test("stabilizeSessionFeedOrder seeds an empty session from the current ranked order", () => {
  assert.deepEqual(stabilizeSessionFeedOrder([], ["bitcoin", "shelter", "witcher"]), ["bitcoin", "shelter", "witcher"]);
});

test("stabilizeSessionFeedOrder preserves the visible order even when the ranker reshuffles existing items", () => {
  assert.deepEqual(
    stabilizeSessionFeedOrder(["bitcoin", "shelter", "witcher"], ["bitcoin", "mike", "witcher", "shelter"]),
    ["bitcoin", "shelter", "witcher", "mike"],
  );
});

test("stabilizeSessionFeedOrder removes items that no longer belong to the active session", () => {
  assert.deepEqual(stabilizeSessionFeedOrder(["bitcoin", "shelter", "witcher"], ["bitcoin", "witcher"]), [
    "bitcoin",
    "witcher",
  ]);
});
