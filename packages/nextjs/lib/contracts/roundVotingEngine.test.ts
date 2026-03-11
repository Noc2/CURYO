import { RoundData } from "../../types/votingTypes";
import {
  DEFAULT_VOTING_CONFIG,
  buildStakeAmountWei,
  deriveRoundSnapshot,
  deriveVoteDeadlines,
  needsApproval,
  resolveFrontendCode,
} from "./roundVotingEngine";
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

test("deriveVoteDeadlines returns the round expiry and next action window", () => {
  const deadlines = deriveVoteDeadlines({
    startTime: 1_000,
    now: 1_500,
    epochDuration: 600,
    maxDuration: 3_600,
  });

  assert.equal(deadlines.epoch1EndTime, 1_600);
  assert.equal(deadlines.deadline, 4_600);
  assert.equal(deadlines.epoch1Remaining, 100);
  assert.equal(deadlines.nextActionRemaining, 100);
});

test("deriveVoteDeadlines falls back to round expiry after epoch 1", () => {
  const deadlines = deriveVoteDeadlines({
    startTime: 1_000,
    now: 1_800,
    epochDuration: 600,
    maxDuration: 3_600,
  });

  assert.equal(deadlines.epoch1Remaining, 0);
  assert.equal(deadlines.nextActionRemaining, deadlines.roundTimeRemaining);
});

test("vote helpers normalize stake, frontend code, and approval checks", () => {
  assert.equal(buildStakeAmountWei(2.5), 2_500_000n);
  assert.equal(needsApproval(1_000_000n, 1_000_001n), true);
  assert.equal(needsApproval(1_000_001n, 1_000_001n), false);
  assert.equal(
    resolveFrontendCode(undefined, "0x1111111111111111111111111111111111111111"),
    "0x1111111111111111111111111111111111111111",
  );
  assert.equal(resolveFrontendCode(undefined, undefined), "0x0000000000000000000000000000000000000000");
});
