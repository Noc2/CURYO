import assert from "node:assert/strict";
import test from "node:test";
import { resolveStableSessionFeedOrder, stabilizeSessionFeedOrder } from "~~/lib/vote/stableFeedOrder";

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

test("resolveStableSessionFeedOrder resets immediately when the feed session changes", () => {
  assert.deepEqual(
    resolveStableSessionFeedOrder({
      previousIds: ["bitcoin", "shelter", "witcher"],
      previousSessionKey: "network-1|for-you",
      nextIds: ["requested", "bitcoin", "mike"],
      nextSessionKey: "network-1|for-you|requested",
    }),
    ["requested", "bitcoin", "mike"],
  );
});

test("resolveStableSessionFeedOrder preserves visible order within the same session", () => {
  assert.deepEqual(
    resolveStableSessionFeedOrder({
      previousIds: ["bitcoin", "shelter", "witcher"],
      previousSessionKey: "network-1|for-you",
      nextIds: ["bitcoin", "mike", "witcher", "shelter"],
      nextSessionKey: "network-1|for-you",
    }),
    ["bitcoin", "shelter", "witcher", "mike"],
  );
});

test("resolveStableSessionFeedOrder promotes a newly requested id without resetting the whole session", () => {
  assert.deepEqual(
    resolveStableSessionFeedOrder({
      previousIds: ["bitcoin", "shelter", "witcher"],
      previousSessionKey: "network-1|for-you",
      nextIds: ["bitcoin", "shelter", "witcher", "requested"],
      nextSessionKey: "network-1|for-you",
      prioritizedIds: ["requested"],
    }),
    ["requested", "bitcoin", "shelter", "witcher"],
  );
});

test("resolveStableSessionFeedOrder does not keep reordering ids that were already present", () => {
  assert.deepEqual(
    resolveStableSessionFeedOrder({
      previousIds: ["bitcoin", "shelter", "witcher"],
      previousSessionKey: "network-1|for-you",
      nextIds: ["bitcoin", "shelter", "witcher"],
      nextSessionKey: "network-1|for-you",
      prioritizedIds: ["shelter"],
    }),
    ["bitcoin", "shelter", "witcher"],
  );
});
