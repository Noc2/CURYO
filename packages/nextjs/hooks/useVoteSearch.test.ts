import { buildVoteSearchTarget, shouldSkipVoteSearchCommit } from "./useVoteSearch";
import assert from "node:assert/strict";
import test from "node:test";

test("buildVoteSearchTarget trims whitespace and encodes the search query", () => {
  assert.equal(buildVoteSearchTarget("  celo votes  "), "/vote?q=celo%20votes");
  assert.equal(buildVoteSearchTarget(""), "/vote");
});

test("shouldSkipVoteSearchCommit blocks short generic queries when no vote search is active", () => {
  assert.equal(shouldSkipVoteSearchCommit("ai", ""), true);
});

test("shouldSkipVoteSearchCommit allows short url-like queries and in-place vote query edits", () => {
  assert.equal(shouldSkipVoteSearchCommit("x.com", ""), false);
  assert.equal(shouldSkipVoteSearchCommit("ai", "existing"), false);
  assert.equal(shouldSkipVoteSearchCommit("   ", ""), false);
});
