import assert from "node:assert/strict";
import test from "node:test";
import {
  getLegacyTwitterSyndicationToken,
  getPreciseTwitterSyndicationToken,
  getTwitterSyndicationTokens,
} from "./twitterSyndication";

test("precise twitter syndication tokens distinguish large tweet IDs that legacy tokens collapse", () => {
  const firstId = "1860000000000000000";
  const secondId = "1860000000000000001";

  assert.equal(getLegacyTwitterSyndicationToken(firstId), getLegacyTwitterSyndicationToken(secondId));
  assert.notEqual(getPreciseTwitterSyndicationToken(firstId), getPreciseTwitterSyndicationToken(secondId));
});

test("twitter syndication token candidates keep the legacy fallback without duplicating identical tokens", () => {
  const id = "1860000000000000123";
  const tokens = getTwitterSyndicationTokens(id);

  assert.ok(tokens.length >= 1);
  assert.ok(tokens.includes(getLegacyTwitterSyndicationToken(id)));
  assert.equal(tokens.length, new Set(tokens).size);
});
