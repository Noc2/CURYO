import { buildInterestProfile } from "./useInterestProfile";
import assert from "node:assert/strict";
import test from "node:test";

test("wallet users with prior votes are treated as voters even before matching feed items load", () => {
  const profile = buildInterestProfile({
    address: "0x123",
    feed: [],
    votes: [
      {
        contentId: 42n,
        roundId: 7n,
        stake: 10n,
        isSettled: false,
        committedAt: "2026-03-17T12:00:00.000Z",
      },
    ],
  });

  assert.equal(profile.stage, "voter");
  assert.equal(profile.totalVoteSignals, 2);
  assert.equal(profile.hasPersonalizedSignals, true);
});
