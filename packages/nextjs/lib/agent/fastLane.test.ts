import { buildAgentFastLaneGuidance } from "./fastLane";
import assert from "node:assert/strict";
import test from "node:test";

test("buildAgentFastLaneGuidance estimates bounty and speed from round terms", () => {
  const guidance = buildAgentFastLaneGuidance({
    bounty: {
      amount: 1_000_000n,
      asset: "USDC",
      feedbackClosesAt: 0n,
      requiredSettledRounds: 1n,
      requiredVoters: 3n,
      rewardPoolExpiresAt: 0n,
    },
    questionCount: 1,
    roundConfig: {
      epochDuration: 1_200n,
      maxDuration: 7_200n,
      maxVoters: 50n,
      minVoters: 3n,
    },
  });

  assert.equal(guidance.speed, "fast");
  assert.equal(guidance.minimumViableQuorum, "3");
  assert.equal(guidance.requiredSignalUnits, "3");
  assert.equal(guidance.suggestedBountyAmountAtomic, "1500000");
  assert.deepEqual(guidance.warnings, []);
});

test("buildAgentFastLaneGuidance warns on slow underfunded asks", () => {
  const guidance = buildAgentFastLaneGuidance({
    bounty: {
      amount: 1_000_000n,
      asset: "USDC",
      feedbackClosesAt: 0n,
      requiredSettledRounds: 2n,
      requiredVoters: 5n,
      rewardPoolExpiresAt: 0n,
    },
    questionCount: 2,
    roundConfig: {
      epochDuration: 86_400n,
      maxDuration: 604_800n,
      maxVoters: 100n,
      minVoters: 5n,
    },
  });

  assert.equal(guidance.speed, "slow");
  assert.equal(guidance.requiredSignalUnits, "20");
  assert.equal(guidance.suggestedBountyAmountAtomic, "10000000");
  assert.deepEqual(guidance.warnings, ["bounty_per_required_vote_is_low", "round_window_is_not_fast_lane"]);
});
