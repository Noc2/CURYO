import type { QuestionRoundConfig } from "~~/lib/questionRoundConfig";
import type { X402QuestionPayload } from "~~/lib/x402/questionPayload";

const MIN_FAST_LANE_PER_VOTER_ATOMIC = 333_333n;
const TARGET_FAST_LANE_PER_VOTER_ATOMIC = 500_000n;

function toPositiveNumber(value: bigint) {
  return Number(value > 0n ? value : 1n);
}

export function buildAgentFastLaneGuidance(params: {
  bounty: X402QuestionPayload["bounty"];
  questionCount: number;
  roundConfig: QuestionRoundConfig;
}) {
  const requiredVoters =
    params.bounty.requiredVoters > 0n ? params.bounty.requiredVoters : params.roundConfig.minVoters;
  const requiredSettledRounds = params.bounty.requiredSettledRounds > 0n ? params.bounty.requiredSettledRounds : 1n;
  const questionCount = BigInt(Math.max(1, params.questionCount));
  const requiredSignalUnits = requiredVoters * requiredSettledRounds * questionCount;
  const perSignalUnit = params.bounty.amount / (requiredSignalUnits > 0n ? requiredSignalUnits : 1n);
  const suggestedBountyAmount = requiredSignalUnits * TARGET_FAST_LANE_PER_VOTER_ATOMIC;
  const estimatedTimeToResultSeconds =
    Number(params.roundConfig.epochDuration) +
    Math.min(Number(params.roundConfig.maxDuration), Math.max(900, toPositiveNumber(requiredVoters) * 300));
  const warnings: string[] = [];

  if (perSignalUnit < MIN_FAST_LANE_PER_VOTER_ATOMIC) {
    warnings.push("bounty_per_required_vote_is_low");
  }
  if (params.roundConfig.maxDuration > 86_400n) {
    warnings.push("round_window_is_not_fast_lane");
  }
  if (requiredVoters < 3n) {
    warnings.push("quorum_is_too_small_for_agent_confidence");
  }

  return {
    estimatedTimeToResultSeconds,
    minimumViableQuorum: "3",
    perRequiredSignalUnitAtomic: perSignalUnit.toString(),
    requiredSignalUnits: requiredSignalUnits.toString(),
    speed:
      estimatedTimeToResultSeconds <= 7_200 ? "fast" : estimatedTimeToResultSeconds <= 86_400 ? "standard" : "slow",
    suggestedBountyAmountAtomic:
      params.bounty.amount >= suggestedBountyAmount
        ? params.bounty.amount.toString()
        : suggestedBountyAmount.toString(),
    warnings,
  };
}
