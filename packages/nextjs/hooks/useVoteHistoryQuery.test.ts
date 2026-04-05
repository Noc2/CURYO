import { buildRpcVoteHistory, getVoteHistoryQueryKey } from "./useVoteHistoryQuery";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import assert from "node:assert/strict";
import test from "node:test";

test("buildRpcVoteHistory classifies settled, cancelled, tied, and reveal-failed rounds from RPC events", () => {
  const votes = buildRpcVoteHistory({
    commitEvents: [
      {
        args: { contentId: 1n, roundId: 10n, stake: 123n },
        blockData: { timestamp: 100n },
      },
      {
        args: { contentId: 2n, roundId: 11n, stake: 456n },
        blockData: { timestamp: 200n },
      },
      {
        args: { contentId: 3n, roundId: 12n, stake: 789n },
      },
      {
        args: { contentId: 4n, roundId: 13n, stake: 42n },
      },
    ],
    settledEvents: [{ args: { contentId: 1n, roundId: 10n } }],
    cancelledEvents: [{ args: { contentId: 2n, roundId: 11n } }],
    tiedEvents: [{ args: { contentId: 3n, roundId: 12n } }],
    revealFailedEvents: [{ args: { contentId: 4n, roundId: 13n } }],
  });

  assert.equal(votes.length, 4);
  assert.deepEqual(
    votes.map(vote => vote.claimType),
    ["reward", "refund", "refund", "refund"],
  );
  assert.deepEqual(
    votes.map(vote => vote.roundState),
    [ROUND_STATE.Settled, ROUND_STATE.Cancelled, ROUND_STATE.Tied, ROUND_STATE.RevealFailed],
  );
  assert.equal(votes[0]?.committedAt, "1970-01-01T00:01:40.000Z");
  assert.equal(votes[1]?.committedAt, "1970-01-01T00:03:20.000Z");
  assert.equal(votes[3]?.isSettled, true);
});

test("getVoteHistoryQueryKey scopes cache entries by chain", () => {
  assert.deepEqual(getVoteHistoryQueryKey("0xabc", 11142220), ["ponder-fallback", "voteHistory", 11142220, "0xabc"]);
  assert.deepEqual(getVoteHistoryQueryKey("0xabc"), ["ponder-fallback", "voteHistory", "unknown", "0xabc"]);
});
