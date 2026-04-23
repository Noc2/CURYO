import { type AgentCohortSummary, buildAgentCohortSummary } from "./cohortSummary";
import { type AgentLiveAskGuidance, buildAgentLiveAskGuidance } from "./liveAskGuidance";
import { ROUND_STATE, ROUND_STATE_LABEL } from "@curyo/contracts/protocol";
import {
  type AgentDecisionAnswer,
  type AgentResultTemplate,
  getAgentResultTemplateBySpecHash,
} from "~~/lib/agent/templates";
import type { ContentFeedbackItem } from "~~/lib/feedback/types";
import type { PonderContentItem } from "~~/services/ponder/client";

type RoundLike = {
  confidenceMass?: string | bigint | number | null;
  conservativeRatingBps?: string | number | null;
  downCount?: number | null;
  downPool?: string | bigint | number | null;
  effectiveEvidence?: string | bigint | number | null;
  ratingBps?: string | number | null;
  revealedCount?: number | null;
  roundId?: string | bigint | number | null;
  settledAt?: string | bigint | number | null;
  settledRounds?: number | null;
  state?: number | null;
  totalStake?: string | bigint | number | null;
  upCount?: number | null;
  upPool?: string | bigint | number | null;
  upWins?: boolean | null;
  voteCount?: number | null;
};

export type AgentResultPackage = {
  ready: boolean;
  answer: AgentDecisionAnswer;
  confidence: {
    level: "none" | "low" | "medium" | "high";
    score: number;
  };
  distribution: {
    rating: number | null;
    ratingBps: number | null;
    conservativeRatingBps: number | null;
    up: {
      count: number;
      stake: string;
      share: number | null;
    };
    down: {
      count: number;
      stake: string;
      share: number | null;
    };
    revealedCount: number;
    state: number | null;
    stateLabel: string | null;
  };
  cohortSummary: AgentCohortSummary | null;
  voteCount: number;
  stakeMass: {
    total: string;
    up: string;
    down: string;
    unit: "raw_staked_voting_power";
  };
  rationaleSummary: string;
  majorObjections: Array<{
    type: string;
    summary: string;
    sourceUrl: string | null;
    roundId: string | null;
  }>;
  dissentingView: string | null;
  feedbackQuality: {
    actionability: "none" | "low" | "medium" | "high";
    objectionCount: number;
    publicNoteCount: number;
    sourceUrlCount: number;
  };
  liveAskGuidance: AgentLiveAskGuidance | null;
  recommendedNextAction:
    | "wait_for_settlement"
    | "proceed"
    | "proceed_after_addressing_objections"
    | "revise_and_resubmit"
    | "do_not_proceed"
    | "collect_more_votes"
    | "manual_review";
  publicUrl: string | null;
  sourceUrls: string[];
  methodology: {
    templateId: string;
    templateVersion: number;
    resultSpecHash: string | null;
    questionMetadataHash: string | null;
    ratingSystem: AgentResultTemplate["ratingSystem"];
    thresholds: AgentResultTemplate["interpretation"];
    sources: string[];
  };
  limitations: string[];
  protocolState: {
    audienceContext: unknown;
    categoryId: string;
    contentId: string;
    currentRating: number | null;
    currentRatingBps: number | null;
    effectiveEvidence: string | null;
    latestRound: RoundLike | null;
    question: string;
    ratingSettledRounds: number | null;
    status: number | null;
  };
};

function toBigIntValue(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.max(0, Math.floor(value)));
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return 0n;
}

function buildFeedbackQuality(
  feedback: readonly ContentFeedbackItem[],
  objections: AgentResultPackage["majorObjections"],
): AgentResultPackage["feedbackQuality"] {
  const sourceUrlCount = new Set(feedback.map(item => item.sourceUrl).filter(Boolean)).size;
  const publicNoteCount = feedback.length;
  let actionability: AgentResultPackage["feedbackQuality"]["actionability"] = "none";
  if (publicNoteCount > 0) actionability = "low";
  if (objections.length > 0 || sourceUrlCount > 0 || publicNoteCount >= 3) actionability = "medium";
  if (objections.length >= 2 && (sourceUrlCount > 0 || publicNoteCount >= 5)) actionability = "high";

  return {
    actionability,
    objectionCount: objections.length,
    publicNoteCount,
    sourceUrlCount,
  };
}

function toNumberValue(value: unknown, fallback: number | null = null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return fallback;
}

function bigintShare(numerator: bigint, denominator: bigint): number | null {
  if (denominator <= 0n) return null;
  return Number((numerator * 10_000n) / denominator) / 10_000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function summarizeFeedbackTypes(feedback: readonly ContentFeedbackItem[]) {
  const counts = new Map<string, number>();
  for (const item of feedback) {
    counts.set(item.feedbackType, (counts.get(item.feedbackType) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([type, count]) => `${count} ${type}`);
}

function summarizeObjectionBody(body: string) {
  const normalized = body.replace(/\s+/g, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
}

function buildMajorObjections(
  feedback: readonly ContentFeedbackItem[],
  downShare: number | null,
): AgentResultPackage["majorObjections"] {
  const objections: AgentResultPackage["majorObjections"] = feedback
    .filter(item => ["concern", "counterpoint", "source_quality"].includes(item.feedbackType))
    .slice(0, 5)
    .map(item => ({
      roundId: item.roundId,
      sourceUrl: item.sourceUrl,
      summary: summarizeObjectionBody(item.body),
      type: item.feedbackType,
    }));

  if (objections.length === 0 && downShare !== null && downShare >= 0.25) {
    objections.push({
      roundId: null,
      sourceUrl: null,
      summary: `${Math.round(downShare * 100)}% of revealed stake voted down, but no public objection text is available.`,
      type: "down_vote_signal",
    });
  }

  return objections;
}

function confidenceLevel(score: number): AgentResultPackage["confidence"]["level"] {
  if (score <= 0) return "none";
  if (score < 0.4) return "low";
  if (score < 0.7) return "medium";
  return "high";
}

function classifyAnswer(params: {
  conservativeRatingBps: number | null;
  ratingBps: number | null;
  roundState: number | null;
  template: AgentResultTemplate;
}): AgentDecisionAnswer {
  if (params.roundState === ROUND_STATE.Open || params.roundState === null) return "pending";
  if (params.roundState === ROUND_STATE.Tied) return "inconclusive";
  if (params.roundState === ROUND_STATE.Cancelled || params.roundState === ROUND_STATE.RevealFailed) return "failed";
  if (params.roundState !== ROUND_STATE.Settled) return "inconclusive";

  const ratingBps = params.ratingBps ?? 5000;
  const conservativeRatingBps = params.conservativeRatingBps ?? ratingBps;
  const thresholds = params.template.interpretation;

  if (ratingBps >= thresholds.proceedRatingBps && conservativeRatingBps >= thresholds.proceedConservativeRatingBps) {
    return "proceed";
  }
  if (ratingBps >= thresholds.cautionRatingBps) return "proceed_with_caution";
  if (ratingBps >= thresholds.reviseRatingBps) return "revise_and_resubmit";
  return "do_not_proceed";
}

function recommendedNextAction(
  answer: AgentDecisionAnswer,
  confidence: AgentResultPackage["confidence"]["level"],
  objectionCount: number,
): AgentResultPackage["recommendedNextAction"] {
  if (answer === "pending") return "wait_for_settlement";
  if (answer === "inconclusive") return "collect_more_votes";
  if (answer === "failed") return "manual_review";
  if (answer === "do_not_proceed") return "do_not_proceed";
  if (answer === "revise_and_resubmit") return "revise_and_resubmit";
  if (confidence === "low") return "collect_more_votes";
  if (objectionCount > 0) return "proceed_after_addressing_objections";
  return "proceed";
}

export function buildAgentResultPackage(params: {
  audienceContext: unknown;
  content: PonderContentItem;
  feedback: readonly ContentFeedbackItem[];
  latestRound: RoundLike | null;
  publicUrl: string | null;
}): AgentResultPackage {
  const latestRound = params.latestRound;
  const roundState = toNumberValue(latestRound?.state, null);
  const latestRoundRatingBps = toNumberValue(latestRound?.ratingBps, null);
  const ratingBps = latestRoundRatingBps ?? toNumberValue(params.content.ratingBps, null) ?? null;
  const conservativeRatingBps =
    toNumberValue(latestRound?.conservativeRatingBps, null) ??
    toNumberValue(params.content.conservativeRatingBps, null) ??
    ratingBps;
  const rating =
    latestRoundRatingBps !== null ? latestRoundRatingBps / 100 : toNumberValue(params.content.rating, null);
  const upStake = toBigIntValue(latestRound?.upPool);
  const downStake = toBigIntValue(latestRound?.downPool);
  const totalStakeFromRound = toBigIntValue(latestRound?.totalStake);
  const stakeTotal = totalStakeFromRound > 0n ? totalStakeFromRound : upStake + downStake;
  const upShare = bigintShare(upStake, stakeTotal);
  const downShare = bigintShare(downStake, stakeTotal);
  const revealedCount = toNumberValue(latestRound?.revealedCount, 0) ?? 0;
  const voteCount = toNumberValue(latestRound?.voteCount, params.content.totalVotes) ?? 0;
  const settledRounds = toNumberValue(params.content.ratingSettledRounds, 0) ?? 0;
  const template = getAgentResultTemplateBySpecHash(params.content.resultSpecHash);
  const answer = classifyAnswer({ conservativeRatingBps, ratingBps, roundState, template });

  const participationScore = clamp01(revealedCount / Math.max(Number(params.content.roundMinVoters ?? 3) * 2, 1));
  const marginScore =
    upShare !== null && downShare !== null
      ? Math.abs(upShare - downShare)
      : ratingBps !== null
        ? Math.abs(ratingBps - 5000) / 5000
        : 0;
  const historyScore = clamp01(settledRounds / 3);
  const confidenceScore =
    roundState === ROUND_STATE.Settled
      ? roundScore(0.5 * participationScore + 0.3 * marginScore + 0.2 * historyScore)
      : 0;
  const confidence = {
    level: confidenceLevel(confidenceScore),
    score: confidenceScore,
  };
  const majorObjections = buildMajorObjections(params.feedback, downShare);
  const feedbackQuality = buildFeedbackQuality(params.feedback, majorObjections);
  const action = recommendedNextAction(answer, confidence.level, majorObjections.length);
  const cohortSummary = buildAgentCohortSummary(params.audienceContext);
  const feedbackTypes = summarizeFeedbackTypes(params.feedback);
  const stateLabel = roundState === null ? null : ROUND_STATE_LABEL[roundState as keyof typeof ROUND_STATE_LABEL];
  const ratingText = ratingBps === null ? "no rating yet" : `${Math.round(ratingBps / 100)}/100`;
  const feedbackText =
    feedbackTypes.length > 0
      ? `Public feedback includes ${feedbackTypes.join(", ")}.`
      : "No public voter feedback is available.";
  const ready = roundState === ROUND_STATE.Settled;
  const liveAskGuidance = buildAgentLiveAskGuidance({ content: params.content });
  const dissentingView =
    downShare !== null && downShare >= 0.15
      ? `Minority down signal: ${Math.round(downShare * 100)}% of revealed stake and ${latestRound?.downCount ?? 0} revealed down votes.`
      : null;
  const limitations = [
    "Curyo ratings are human judgment signals, not factual proof.",
    "Confidence is derived from revealed participation, stake margin, and settled history.",
  ];

  if (!ready) limitations.push("The latest round is not settled, so the result can change.");
  if (params.feedback.length === 0) limitations.push("No public feedback text is available for rationale extraction.");
  if (revealedCount < Math.max(Number(params.content.roundMinVoters ?? 3), 3)) {
    limitations.push("The revealed vote count is low.");
  }

  return {
    answer,
    cohortSummary,
    confidence,
    distribution: {
      conservativeRatingBps,
      down: {
        count: latestRound?.downCount ?? 0,
        share: downShare,
        stake: downStake.toString(),
      },
      rating,
      ratingBps,
      revealedCount,
      state: roundState,
      stateLabel,
      up: {
        count: latestRound?.upCount ?? 0,
        share: upShare,
        stake: upStake.toString(),
      },
    },
    dissentingView,
    feedbackQuality,
    liveAskGuidance,
    limitations,
    majorObjections,
    methodology: {
      questionMetadataHash: params.content.questionMetadataHash ?? null,
      ratingSystem: template.ratingSystem,
      resultSpecHash: params.content.resultSpecHash ?? null,
      sources: ["ponder.content", "ponder.rounds", "public.content_feedback"],
      templateId: template.id,
      templateVersion: template.version,
      thresholds: template.interpretation,
    },
    protocolState: {
      audienceContext: params.audienceContext,
      categoryId: params.content.categoryId?.toString?.() ?? String(params.content.categoryId ?? ""),
      contentId: params.content.id,
      currentRating: rating,
      currentRatingBps: ratingBps,
      effectiveEvidence: params.content.ratingEffectiveEvidence ?? latestRound?.effectiveEvidence?.toString?.() ?? null,
      latestRound,
      question: params.content.question ?? params.content.title,
      ratingSettledRounds: settledRounds,
      status: params.content.status ?? null,
    },
    publicUrl: params.publicUrl,
    rationaleSummary: `Latest ${stateLabel ?? "unknown"} round has ${ratingText}, ${revealedCount} revealed votes, and ${stakeTotal.toString()} raw stake. ${feedbackText}`,
    ready,
    recommendedNextAction: action,
    sourceUrls: [...new Set(params.feedback.map(item => item.sourceUrl).filter((url): url is string => !!url))],
    stakeMass: {
      down: downStake.toString(),
      total: stakeTotal.toString(),
      unit: "raw_staked_voting_power",
      up: upStake.toString(),
    },
    voteCount,
  };
}
