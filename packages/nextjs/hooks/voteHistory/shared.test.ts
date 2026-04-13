import { getVoteClaimType, mapVoteHistoryItem, mergeVoteHistoryItems } from "./shared";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import assert from "node:assert/strict";
import test from "node:test";

test("getVoteClaimType marks settled rounds as rewards and refund-eligible terminal rounds as refunds", () => {
  assert.equal(getVoteClaimType(ROUND_STATE.Open), null);
  assert.equal(getVoteClaimType(ROUND_STATE.Settled), "reward");
  assert.equal(getVoteClaimType(ROUND_STATE.Cancelled), "refund");
  assert.equal(getVoteClaimType(ROUND_STATE.Tied), "refund");
  assert.equal(getVoteClaimType(ROUND_STATE.RevealFailed), "refund");
});

test("mapVoteHistoryItem preserves terminal round state and claim type", () => {
  const refundVote = mapVoteHistoryItem({
    contentId: "42",
    roundId: "7",
    stake: "1000",
    roundState: ROUND_STATE.RevealFailed,
    committedAt: "2026-03-31T12:00:00.000Z",
  });

  assert.equal(refundVote.isSettled, true);
  assert.equal(refundVote.claimType, "refund");
  assert.equal(refundVote.roundState, ROUND_STATE.RevealFailed);

  const rewardVote = mapVoteHistoryItem({
    contentId: "43",
    roundId: "8",
    stake: "2000",
    roundState: ROUND_STATE.Settled,
  });

  assert.equal(rewardVote.isSettled, true);
  assert.equal(rewardVote.claimType, "reward");
  assert.equal(rewardVote.roundState, ROUND_STATE.Settled);
});

test("mapVoteHistoryItem normalizes Ponder Unix-second vote timestamps", () => {
  const vote = mapVoteHistoryItem({
    contentId: "42",
    roundId: "7",
    stake: "1000",
    roundState: ROUND_STATE.Open,
    committedAt: "1710000000",
  });

  assert.equal(vote.committedAt, "2024-03-09T16:00:00.000Z");
});

test("mergeVoteHistoryItems deduplicates overlapping votes and keeps newest votes first", () => {
  const merged = mergeVoteHistoryItems([
    [
      {
        contentId: 42n,
        roundId: 8n,
        stake: 2_000_000n,
        isSettled: false,
        roundState: ROUND_STATE.Open,
        claimType: null,
        committedAt: "2026-04-08T08:00:00.000Z",
      },
      {
        contentId: 7n,
        roundId: 2n,
        stake: 1_000_000n,
        isSettled: false,
        roundState: ROUND_STATE.Open,
        claimType: null,
        committedAt: "2026-04-07T08:00:00.000Z",
      },
    ],
    [
      {
        contentId: 42n,
        roundId: 8n,
        stake: 2_000_000n,
        isSettled: false,
        roundState: ROUND_STATE.Open,
        claimType: null,
        committedAt: "2026-04-08T08:00:00.000Z",
      },
      {
        contentId: 99n,
        roundId: 3n,
        stake: 5_000_000n,
        isSettled: true,
        roundState: ROUND_STATE.Settled,
        claimType: "reward",
        committedAt: "2026-04-08T09:00:00.000Z",
      },
    ],
  ]);

  assert.equal(merged.length, 3);
  assert.deepEqual(
    merged.map(vote => vote.contentId),
    [99n, 42n, 7n],
  );
});
