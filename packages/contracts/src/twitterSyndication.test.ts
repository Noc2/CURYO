import assert from "node:assert/strict";
import test from "node:test";
import { getPreciseTwitterSyndicationToken, getTwitterSyndicationTokens } from "./twitterSyndication";

test("precise twitter syndication tokens distinguish adjacent large tweet IDs", () => {
  const firstId = "1860000000000000000";
  const secondId = "1860000000000000001";

  assert.notEqual(getPreciseTwitterSyndicationToken(firstId), getPreciseTwitterSyndicationToken(secondId));
});

test("twitter syndication token candidates use the precise token only", () => {
  const id = "1860000000000000123";
  const tokens = getTwitterSyndicationTokens(id);

  assert.deepEqual(tokens, [getPreciseTwitterSyndicationToken(id)]);
});
