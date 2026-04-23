import type { QuestionRoundConfig } from "~~/lib/questionRoundConfig";
import type { X402QuestionPayload } from "~~/lib/x402/questionPayload";

const MIN_FAST_LANE_PER_VOTER_ATOMIC = 333_333n;
const TARGET_FAST_LANE_PER_VOTER_ATOMIC = 500_000n;
const BROAD_RESPONSE_PER_VOTER_ATOMIC = 750_000n;

function toPositiveNumber(value: bigint) {
  return Number(value > 0n ? value : 1n);
}

function minBigInt(a: bigint, b: bigint) {
  return a < b ? a : b;
}

export function buildAgentFastLaneGuidance(params: {
  bounty: X402QuestionPayload["bounty"];
  nowSeconds?: number;
  questionCount: number;
  roundConfig: QuestionRoundConfig;
}) {
  const requiredVoters =
    params.bounty.requiredVoters > 0n ? params.bounty.requiredVoters : params.roundConfig.minVoters;
  const requiredSettledRounds = params.bounty.requiredSettledRounds > 0n ? params.bounty.requiredSettledRounds : 1n;
  const questionCount = BigInt(Math.max(1, params.questionCount));
  const requiredSignalUnits = requiredVoters * requiredSettledRounds * questionCount;
  const perSignalUnit = params.bounty.amount / (requiredSignalUnits > 0n ? requiredSignalUnits : 1n);
  const conservativeStartingBounty = requiredSignalUnits * MIN_FAST_LANE_PER_VOTER_ATOMIC;
  const suggestedBountyAmount = requiredSignalUnits * TARGET_FAST_LANE_PER_VOTER_ATOMIC;
  const broadResponseBounty = requiredSignalUnits * BROAD_RESPONSE_PER_VOTER_ATOMIC;
  const estimatedTimeToResultSeconds =
    Number(params.roundConfig.epochDuration) +
    Math.min(Number(params.roundConfig.maxDuration), Math.max(900, toPositiveNumber(requiredVoters) * 300));
  const estimatedResultAt = (params.nowSeconds ?? Math.floor(Date.now() / 1000)) + estimatedTimeToResultSeconds;
  const healthyTargetVoterBuffer = requiredVoters <= 4n ? 1n : requiredVoters <= 10n ? 2n : 3n;
  const healthyTargetVoters = minBigInt(
    params.roundConfig.maxVoters > 0n ? params.roundConfig.maxVoters : requiredVoters + healthyTargetVoterBuffer,
    requiredVoters + healthyTargetVoterBuffer,
  );
  const warnings: string[] = [];
  const guidance = ["quote_first", "start_small_then_top_up"];

  if (perSignalUnit < MIN_FAST_LANE_PER_VOTER_ATOMIC) {
    warnings.push("bounty_per_required_vote_is_low");
  }
  if (params.roundConfig.maxDuration > 86_400n) {
    warnings.push("round_window_is_not_fast_lane");
  }
  if (requiredVoters < 3n) {
    warnings.push("quorum_is_too_small_for_agent_confidence");
  }

  if (perSignalUnit < MIN_FAST_LANE_PER_VOTER_ATOMIC) {
    guidance.push("increase_bounty_before_submit");
  }
  if (params.roundConfig.maxDuration > 86_400n) {
    guidance.push("expect_slow_result");
  }

  const likelyOutcome =
    perSignalUnit < MIN_FAST_LANE_PER_VOTER_ATOMIC
      ? "thin"
      : perSignalUnit >= BROAD_RESPONSE_PER_VOTER_ATOMIC
        ? "broad"
        : "healthy";
  const pricingConfidence =
    warnings.length === 0 && likelyOutcome !== "thin"
      ? "high"
      : warnings.length <= 1 && likelyOutcome !== "thin"
        ? "medium"
        : "low";
  const recommendedAction =
    perSignalUnit < MIN_FAST_LANE_PER_VOTER_ATOMIC
      ? "raise_before_submit"
      : params.roundConfig.maxDuration > 86_400n
        ? "adjust_round_window"
        : "start_small";

  return {
    conservativeStartingBountyAtomic:
      params.bounty.amount <= conservativeStartingBounty
        ? params.bounty.amount.toString()
        : conservativeStartingBounty.toString(),
    estimatedTimeToResultSeconds,
    estimatedResultAt,
    expectedResponse: {
      healthyTargetVoters: healthyTargetVoters.toString(),
      likelyOutcome,
      minimumExpectedVoters: requiredVoters.toString(),
    },
    guidance,
    minimumViableQuorum: "3",
    perRequiredSignalUnitAtomic: perSignalUnit.toString(),
    pricingConfidence,
    recommendedAction,
    requiredSignalUnits: requiredSignalUnits.toString(),
    speed:
      estimatedTimeToResultSeconds <= 7_200 ? "fast" : estimatedTimeToResultSeconds <= 86_400 ? "standard" : "slow",
    stretchBountyAmountAtomic:
      params.bounty.amount >= broadResponseBounty ? params.bounty.amount.toString() : broadResponseBounty.toString(),
    suggestedBountyAmountAtomic:
      params.bounty.amount >= suggestedBountyAmount
        ? params.bounty.amount.toString()
        : suggestedBountyAmount.toString(),
    warnings,
  };
}
