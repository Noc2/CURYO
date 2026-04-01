import { getVoteClaimType, mapVoteHistoryItem } from "./shared";
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
