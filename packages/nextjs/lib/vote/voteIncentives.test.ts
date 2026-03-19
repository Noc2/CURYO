import assert from "node:assert/strict";
import test from "node:test";
import { estimateVoteReturn, getRoundProgressMessaging } from "~~/lib/vote/voteIncentives";

test("getRoundProgressMessaging makes blind rounds sell bonus and urgency", () => {
  const message = getRoundProgressMessaging(
    {
      phase: "voting",
      isEpoch1: true,
      epoch1Remaining: 11 * 60,
      readyToSettle: false,
      thresholdReachedAt: 0,
      voteCount: 1,
      revealedCount: 0,
      minVoters: 3,
      upPool: 0n,
      downPool: 0n,
      weightedUpPool: 0n,
      weightedDownPool: 0n,
    },
    90,
  );

  assert.deepEqual(message, {
    badgeLabel: "Blind",
    badgeTone: "primary",
    detailLabel: "+90% bonus · 11:00 left",
    detailTone: "warning",
    tooltip:
      "Blind votes stay hidden and earn full reward weight. Open-phase votes use 25% informed weight, so early voters keep the 4x advantage.",
  });
});

test("getRoundProgressMessaging reframes open rounds around settlement momentum", () => {
  const message = getRoundProgressMessaging({
    phase: "voting",
    isEpoch1: false,
    epoch1Remaining: 0,
    readyToSettle: false,
    thresholdReachedAt: 0,
    voteCount: 2,
    revealedCount: 1,
    minVoters: 3,
    upPool: 10n,
    downPool: 8n,
    weightedUpPool: 10n,
    weightedDownPool: 8n,
  });

  assert.equal(message?.badgeLabel, "Open");
  assert.equal(message?.detailLabel, "Only 1 more vote to settle");
});

test("estimateVoteReturn uses informed weight during open phase", () => {
  const estimate = estimateVoteReturn(
    {
      isEpoch1: false,
      upPool: 20_000_000n,
      downPool: 40_000_000n,
      weightedUpPool: 20_000_000n,
      weightedDownPool: 40_000_000n,
    },
    true,
    10,
  );

  assert.equal(estimate.effectiveStakeMicro, 2_500_000n);
  assert.equal(estimate.projectedVoterPoolMicro, 30_400_000n);
  assert.equal(estimate.projectedPoolShareMicro, 3_377_777n);
  assert.equal(estimate.estimatedGrossReturnMicro, 13_377_777n);
  assert.equal(estimate.revealedLoserRefundMicro, 500_000n);
});

test("estimateVoteReturn keeps full weight during blind phase", () => {
  const estimate = estimateVoteReturn(
    {
      isEpoch1: true,
      upPool: 20_000_000n,
      downPool: 40_000_000n,
      weightedUpPool: 20_000_000n,
      weightedDownPool: 40_000_000n,
    },
    true,
    10,
  );

  assert.equal(estimate.effectiveStakeMicro, 10_000_000n);
  assert.equal(estimate.projectedPoolShareMicro, 10_133_333n);
  assert.equal(estimate.estimatedGrossReturnMicro, 20_133_333n);
});
