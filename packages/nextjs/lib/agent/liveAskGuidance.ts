import { buildAgentFastLaneGuidance } from "./fastLane";
import type { PonderContentItem } from "~~/services/ponder/client";

export type AgentLiveAskGuidance = {
  lowResponseRisk: "low" | "medium" | "high";
  reasonCodes: string[];
  recommendedAction: "wait" | "top_up" | "retry_later";
  suggestedTopUpAtomic: string | null;
};

function toBigIntValue(value: unknown, fallback = 0n) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.max(0, Math.floor(value)));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return fallback;
}

function toOptionalUnixSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const normalized = Math.floor(value);
    return normalized > 0 ? normalized : null;
  }
  if (typeof value === "bigint") return value > 0n ? Number(value) : null;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const normalized = Number.parseInt(value, 10);
    return normalized > 0 ? normalized : null;
  }
  return null;
}

export function buildAgentLiveAskGuidance(params: {
  content: Pick<PonderContentItem, "openRound" | "rewardPoolSummary" | "roundEpochDuration" | "roundMaxDuration" | "roundMaxVoters" | "roundMinVoters">;
  nowSeconds?: number;
}): AgentLiveAskGuidance | null {
  const openRound = params.content.openRound;
  const rewardPoolSummary = params.content.rewardPoolSummary;
  if (!openRound || !rewardPoolSummary?.hasActiveBounty) return null;

  const currentBounty = toBigIntValue(rewardPoolSummary.currentRewardPoolAmount);
  const minVoters = toBigIntValue(openRound.minVoters ?? params.content.roundMinVoters ?? 3, 3n);
  const maxVoters = toBigIntValue(openRound.maxVoters ?? params.content.roundMaxVoters ?? minVoters, minVoters);
  const guidanceTarget = buildAgentFastLaneGuidance({
    bounty: {
      amount: currentBounty,
      asset: "USDC",
      feedbackClosesAt: 0n,
      requiredSettledRounds: 1n,
      requiredVoters: minVoters,
      rewardPoolExpiresAt: 0n,
    },
    nowSeconds: params.nowSeconds,
    questionCount: 1,
    roundConfig: {
      epochDuration: toBigIntValue(openRound.epochDuration ?? params.content.roundEpochDuration ?? 0, 0n),
      maxDuration: toBigIntValue(openRound.maxDuration ?? params.content.roundMaxDuration ?? 0, 0n),
      maxVoters,
      minVoters,
    },
  });

  const conservativeStart = toBigIntValue(guidanceTarget.conservativeStartingBountyAtomic);
  const healthyTarget = toBigIntValue(guidanceTarget.suggestedBountyAmountAtomic);
  const suggestedTopUp = healthyTarget > currentBounty ? healthyTarget - currentBounty : 0n;
  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const bountyClosesAt = toOptionalUnixSeconds(rewardPoolSummary.nextBountyClosesAt);
  const estimatedSettlementTime = toOptionalUnixSeconds(openRound.estimatedSettlementTime);
  const voteGap = Math.max(Number(minVoters) - Math.max(0, openRound.voteCount), 0);
  const reasonCodes: string[] = [];

  if (voteGap > 0) reasonCodes.push("quorum_not_reached");
  if (toOptionalUnixSeconds(openRound.lowSince) !== null) reasonCodes.push("low_response_persisting");
  if (currentBounty < conservativeStart) reasonCodes.push("bounty_below_conservative_start");
  if (currentBounty < healthyTarget) reasonCodes.push("bounty_below_healthy_target");
  if (bountyClosesAt !== null && bountyClosesAt <= nowSeconds + 3_600) reasonCodes.push("bounty_closing_soon");
  if (estimatedSettlementTime !== null && estimatedSettlementTime <= nowSeconds + 900 && voteGap > 0) {
    reasonCodes.push("settlement_near_with_quorum_gap");
  }

  let lowResponseRisk: AgentLiveAskGuidance["lowResponseRisk"] = "low";
  if (voteGap > 0 || currentBounty < healthyTarget) lowResponseRisk = "medium";
  if (
    reasonCodes.includes("low_response_persisting") ||
    reasonCodes.includes("bounty_below_conservative_start") ||
    reasonCodes.includes("bounty_closing_soon") ||
    reasonCodes.includes("settlement_near_with_quorum_gap")
  ) {
    lowResponseRisk = "high";
  }

  let recommendedAction: AgentLiveAskGuidance["recommendedAction"] = "wait";
  if (lowResponseRisk === "high" && reasonCodes.includes("bounty_closing_soon") && voteGap > 0) {
    recommendedAction = "retry_later";
  } else if (lowResponseRisk !== "low" && suggestedTopUp > 0n) {
    recommendedAction = "top_up";
  }

  return {
    lowResponseRisk,
    reasonCodes,
    recommendedAction,
    suggestedTopUpAtomic: suggestedTopUp > 0n ? suggestedTopUp.toString() : null,
  };
}
