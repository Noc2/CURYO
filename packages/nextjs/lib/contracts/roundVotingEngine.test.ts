import { RoundData } from "../../types/votingTypes";
import { DEFAULT_VOTING_CONFIG, deriveRoundSnapshot } from "./roundVotingEngine";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import assert from "node:assert/strict";
import test from "node:test";

function makeRound(overrides: Partial<RoundData> = {}): RoundData {
  return {
    startTime: 1_000n,
    state: ROUND_STATE.Open,
    voteCount: 0n,
    revealedCount: 0n,
    totalStake: 0n,
    upPool: 0n,
    downPool: 0n,
    upCount: 0n,
    downCount: 0n,
    upWins: false,
    settledAt: 0n,
    thresholdReachedAt: 0n,
    weightedUpPool: 0n,
    weightedDownPool: 0n,
    ...overrides,
  };
}

test("deriveRoundSnapshot tracks settlement readiness from revealed votes, not committed votes", () => {
  const snapshot = deriveRoundSnapshot({
    roundId: 1n,
    round: makeRound({
      voteCount: 3n,
      revealedCount: 1n,
      totalStake: 30_000_000n,
    }),
    config: DEFAULT_VOTING_CONFIG,
    now: 1_100,
  });

  assert.equal(snapshot.voteCount, 3);
  assert.equal(snapshot.revealedCount, 1);
  assert.equal(snapshot.votersNeeded, 2);
  assert.equal(snapshot.readyToSettle, false);
});

test("deriveRoundSnapshot marks rounds ready once the revealed threshold is met", () => {
  const snapshot = deriveRoundSnapshot({
    roundId: 1n,
    round: makeRound({
      voteCount: 5n,
      revealedCount: BigInt(DEFAULT_VOTING_CONFIG.minVoters),
      thresholdReachedAt: 1_250n,
    }),
    config: DEFAULT_VOTING_CONFIG,
    now: 1_300,
  });

  assert.equal(snapshot.votersNeeded, 0);
  assert.equal(snapshot.readyToSettle, true);
  assert.equal(snapshot.thresholdReachedAt, 1250);
});
