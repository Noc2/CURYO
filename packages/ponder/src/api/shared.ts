import { DEFAULT_REVEAL_GRACE_PERIOD_SECONDS, DEFAULT_ROUND_CONFIG, ROUND_STATE } from "@curyo/contracts/protocol";
import type { Context, Hono } from "hono";
import { and, desc, eq, inArray, replaceBigInts, sql } from "ponder";
import { db } from "ponder:api";
import { feedbackBonusPool, questionRewardPool, round } from "ponder:schema";
import { isValidAddress, safeBigInt } from "./utils.js";

export type ApiApp = Hono;

export const DISCOVER_MODULE_LIMIT = 6;
export const SETTLING_SOON_WINDOW_SECONDS = 24 * 60 * 60;
export const NOTIFICATION_EMAIL_LOOKBACK_SECONDS = 48 * 60 * 60;
export const AVATAR_CATEGORY_WINDOW_SECONDS = 90 * 24 * 60 * 60;

export function jsonBig(c: Context, data: unknown, status?: number) {
  const payload = replaceBigInts(data, (value: bigint) => String(value));
  return status === undefined ? c.json(payload) : c.json(payload, status as any);
}

export function parseBigIntList(value: string | undefined, max = 50) {
  if (!value) return [];

  const unique = new Set<string>();
  const items: bigint[] = [];

  for (const raw of value.split(",").slice(0, max)) {
    const parsed = safeBigInt(raw.trim());
    if (parsed === null) continue;

    const key = parsed.toString();
    if (unique.has(key)) continue;
    unique.add(key);
    items.push(parsed);
  }

  return items;
}

export function parseAddressList(value: string | undefined, max = 200) {
  if (!value) return [];

  const unique = new Set<string>();
  const items: `0x${string}`[] = [];

  for (const raw of value.split(",").slice(0, max)) {
    const address = raw.trim().toLowerCase() as `0x${string}`;
    if (!isValidAddress(address)) continue;
    if (unique.has(address)) continue;
    unique.add(address);
    items.push(address);
  }

  return items;
}

export function getEstimatedSettlementTime(
  startTime: bigint | null | undefined,
  epochDurationSeconds = DEFAULT_ROUND_CONFIG.epochDurationSeconds,
) {
  if (startTime === null || startTime === undefined) return null;

  return (
    startTime
    + BigInt(epochDurationSeconds)
    + BigInt(DEFAULT_REVEAL_GRACE_PERIOD_SECONDS)
  );
}

export function getDiscoverResolutionOutcome(state: number | null, isUp: boolean | null, upWins: boolean | null) {
  if (state === ROUND_STATE.Cancelled) return "cancelled" as const;
  if (state === ROUND_STATE.Tied) return "tied" as const;
  if (state === ROUND_STATE.RevealFailed) return "reveal_failed" as const;
  if (state === ROUND_STATE.Settled && isUp !== null && upWins !== null) {
    return isUp === upWins ? "won" as const : "lost" as const;
  }

  return "resolved" as const;
}

export async function attachOpenRoundSummary<T extends { id: bigint }>(items: T[]) {
  if (items.length === 0) {
    return items.map(item => ({
      ...item,
      contentId: item.id,
      question: "title" in item ? item.title : undefined,
      link: "url" in item ? item.url || null : undefined,
      rewardPoolSummary: emptyRewardPoolSummary(),
      feedbackBonusSummary: emptyFeedbackBonusSummary(),
      openRound: null,
    }));
  }

  const contentIds = items.map(item => item.id);
  const rewardPoolRows = await db
    .select({
      contentId: questionRewardPool.contentId,
      rewardPoolCount: sql<number>`count(*)`,
      activeRewardPoolCount: sql<number>`sum(case when ${questionRewardPool.refunded} = false and ${questionRewardPool.qualifiedRounds} < ${questionRewardPool.requiredSettledRounds} then 1 else 0 end)`,
      totalFundedAmount: sql<bigint>`coalesce(sum(${questionRewardPool.fundedAmount}), 0)`,
      totalUnallocatedAmount: sql<bigint>`coalesce(sum(${questionRewardPool.unallocatedAmount}), 0)`,
      totalAllocatedAmount: sql<bigint>`coalesce(sum(${questionRewardPool.allocatedAmount}), 0)`,
      totalClaimedAmount: sql<bigint>`coalesce(sum(${questionRewardPool.claimedAmount}), 0)`,
      totalVoterClaimedAmount: sql<bigint>`coalesce(sum(${questionRewardPool.voterClaimedAmount}), 0)`,
      totalFrontendClaimedAmount: sql<bigint>`coalesce(sum(${questionRewardPool.frontendClaimedAmount}), 0)`,
      totalRefundedAmount: sql<bigint>`coalesce(sum(${questionRewardPool.refundedAmount}), 0)`,
      qualifiedRoundCount: sql<number>`coalesce(sum(${questionRewardPool.qualifiedRounds}), 0)`,
    })
    .from(questionRewardPool)
    .where(inArray(questionRewardPool.contentId, contentIds))
    .groupBy(questionRewardPool.contentId);

  const rewardPoolSummaryByContentId = new Map<bigint, ReturnType<typeof formatRewardPoolSummary>>();
  for (const row of rewardPoolRows) {
    rewardPoolSummaryByContentId.set(row.contentId, formatRewardPoolSummary(row));
  }

  const feedbackBonusRows = await db
    .select({
      contentId: feedbackBonusPool.contentId,
      poolCount: sql<number>`count(*)`,
      activePoolCount: sql<number>`sum(case when ${feedbackBonusPool.forfeited} = false and ${feedbackBonusPool.remainingAmount} > 0 then 1 else 0 end)`,
      totalFundedAmount: sql<bigint>`coalesce(sum(${feedbackBonusPool.fundedAmount}), 0)`,
      totalRemainingAmount: sql<bigint>`coalesce(sum(${feedbackBonusPool.remainingAmount}), 0)`,
      totalAwardedAmount: sql<bigint>`coalesce(sum(${feedbackBonusPool.awardedAmount}), 0)`,
      totalVoterAwardedAmount: sql<bigint>`coalesce(sum(${feedbackBonusPool.voterAwardedAmount}), 0)`,
      totalFrontendAwardedAmount: sql<bigint>`coalesce(sum(${feedbackBonusPool.frontendAwardedAmount}), 0)`,
      totalForfeitedAmount: sql<bigint>`coalesce(sum(${feedbackBonusPool.forfeitedAmount}), 0)`,
      awardCount: sql<number>`coalesce(sum(${feedbackBonusPool.awardCount}), 0)`,
    })
    .from(feedbackBonusPool)
    .where(inArray(feedbackBonusPool.contentId, contentIds))
    .groupBy(feedbackBonusPool.contentId);

  const feedbackBonusSummaryByContentId = new Map<bigint, ReturnType<typeof formatFeedbackBonusSummary>>();
  for (const row of feedbackBonusRows) {
    feedbackBonusSummaryByContentId.set(row.contentId, formatFeedbackBonusSummary(row));
  }

  const openRounds = await db
    .select({
      contentId: round.contentId,
      roundId: round.roundId,
      voteCount: round.voteCount,
      revealedCount: round.revealedCount,
      totalStake: round.totalStake,
      upPool: round.upPool,
      downPool: round.downPool,
      upCount: round.upCount,
      downCount: round.downCount,
      referenceRatingBps: round.referenceRatingBps,
      ratingBps: round.ratingBps,
      conservativeRatingBps: round.conservativeRatingBps,
      confidenceMass: round.confidenceMass,
      effectiveEvidence: round.effectiveEvidence,
      settledRounds: round.settledRounds,
      lowSince: round.lowSince,
      startTime: round.startTime,
      epochDuration: round.epochDuration,
      maxDuration: round.maxDuration,
      minVoters: round.minVoters,
      maxVoters: round.maxVoters,
    })
    .from(round)
    .where(and(inArray(round.contentId, contentIds), eq(round.state, ROUND_STATE.Open)))
    .orderBy(desc(round.roundId));

  const latestOpenRoundByContentId = new Map<bigint, (typeof openRounds)[number]>();
  for (const row of openRounds) {
    if (!latestOpenRoundByContentId.has(row.contentId)) {
      latestOpenRoundByContentId.set(row.contentId, row);
    }
  }

  return items.map(item => {
    const openRound = latestOpenRoundByContentId.get(item.id);
    const rewardPoolSummary = rewardPoolSummaryByContentId.get(item.id) ?? emptyRewardPoolSummary();
    const feedbackBonusSummary = feedbackBonusSummaryByContentId.get(item.id) ?? emptyFeedbackBonusSummary();

    return {
      ...item,
      contentId: item.id,
      question: "title" in item ? item.title : undefined,
      link: "url" in item ? item.url || null : undefined,
      rewardPoolSummary,
      feedbackBonusSummary,
      openRound: openRound
        ? {
            roundId: openRound.roundId,
            voteCount: openRound.voteCount,
            revealedCount: openRound.revealedCount,
            totalStake: openRound.totalStake,
            upPool: openRound.upPool,
            downPool: openRound.downPool,
            upCount: openRound.upCount,
            downCount: openRound.downCount,
            referenceRatingBps: openRound.referenceRatingBps,
            ratingBps: openRound.ratingBps,
            conservativeRatingBps: openRound.conservativeRatingBps,
            confidenceMass: openRound.confidenceMass,
            effectiveEvidence: openRound.effectiveEvidence,
            settledRounds: openRound.settledRounds,
            lowSince: openRound.lowSince,
            startTime: openRound.startTime,
            epochDuration: openRound.epochDuration,
            maxDuration: openRound.maxDuration,
            minVoters: openRound.minVoters,
            maxVoters: openRound.maxVoters,
            estimatedSettlementTime: getEstimatedSettlementTime(openRound.startTime, openRound.epochDuration),
          }
        : null,
    };
  });
}

function emptyRewardPoolSummary() {
  return {
    currency: "USDC",
    displayCurrency: "USD",
    decimals: 6,
    rewardPoolCount: 0,
    activeRewardPoolCount: 0,
    totalFundedAmount: 0n,
    totalUnallocatedAmount: 0n,
    totalAllocatedAmount: 0n,
    totalClaimedAmount: 0n,
    totalVoterClaimedAmount: 0n,
    totalFrontendClaimedAmount: 0n,
    totalRefundedAmount: 0n,
    qualifiedRoundCount: 0,
    currentRewardPoolAmount: 0n,
  };
}

function emptyFeedbackBonusSummary() {
  return {
    currency: "USDC",
    displayCurrency: "USD",
    decimals: 6,
    poolCount: 0,
    activePoolCount: 0,
    totalFundedAmount: 0n,
    totalRemainingAmount: 0n,
    totalAwardedAmount: 0n,
    totalVoterAwardedAmount: 0n,
    totalFrontendAwardedAmount: 0n,
    totalForfeitedAmount: 0n,
    awardCount: 0,
  };
}

function toBigIntValue(value: bigint | string | number | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
}

function formatFeedbackBonusSummary(row: {
  poolCount: number | string | bigint | null;
  activePoolCount: number | string | bigint | null;
  totalFundedAmount: bigint | string | number | null;
  totalRemainingAmount: bigint | string | number | null;
  totalAwardedAmount: bigint | string | number | null;
  totalVoterAwardedAmount: bigint | string | number | null;
  totalFrontendAwardedAmount: bigint | string | number | null;
  totalForfeitedAmount: bigint | string | number | null;
  awardCount: number | string | bigint | null;
}) {
  return {
    currency: "USDC",
    displayCurrency: "USD",
    decimals: 6,
    poolCount: toNumberValue(row.poolCount),
    activePoolCount: toNumberValue(row.activePoolCount),
    totalFundedAmount: toBigIntValue(row.totalFundedAmount),
    totalRemainingAmount: toBigIntValue(row.totalRemainingAmount),
    totalAwardedAmount: toBigIntValue(row.totalAwardedAmount),
    totalVoterAwardedAmount: toBigIntValue(row.totalVoterAwardedAmount),
    totalFrontendAwardedAmount: toBigIntValue(row.totalFrontendAwardedAmount),
    totalForfeitedAmount: toBigIntValue(row.totalForfeitedAmount),
    awardCount: toNumberValue(row.awardCount),
  };
}

function toNumberValue(value: number | string | bigint | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) return Number(value);
  return 0;
}

function formatRewardPoolSummary(row: {
  rewardPoolCount: number | string | bigint | null;
  activeRewardPoolCount: number | string | bigint | null;
  totalFundedAmount: bigint | string | number | null;
  totalUnallocatedAmount: bigint | string | number | null;
  totalAllocatedAmount: bigint | string | number | null;
  totalClaimedAmount: bigint | string | number | null;
  totalVoterClaimedAmount: bigint | string | number | null;
  totalFrontendClaimedAmount: bigint | string | number | null;
  totalRefundedAmount: bigint | string | number | null;
  qualifiedRoundCount: number | string | bigint | null;
}) {
  const totalUnallocatedAmount = toBigIntValue(row.totalUnallocatedAmount);
  const totalAllocatedAmount = toBigIntValue(row.totalAllocatedAmount);
  const totalClaimedAmount = toBigIntValue(row.totalClaimedAmount);

  return {
    currency: "USDC",
    displayCurrency: "USD",
    decimals: 6,
    rewardPoolCount: toNumberValue(row.rewardPoolCount),
    activeRewardPoolCount: toNumberValue(row.activeRewardPoolCount),
    totalFundedAmount: toBigIntValue(row.totalFundedAmount),
    totalUnallocatedAmount,
    totalAllocatedAmount,
    totalClaimedAmount,
    totalVoterClaimedAmount: toBigIntValue(row.totalVoterClaimedAmount),
    totalFrontendClaimedAmount: toBigIntValue(row.totalFrontendClaimedAmount),
    totalRefundedAmount: toBigIntValue(row.totalRefundedAmount),
    qualifiedRoundCount: toNumberValue(row.qualifiedRoundCount),
    currentRewardPoolAmount: totalUnallocatedAmount + totalAllocatedAmount - totalClaimedAmount,
  };
}
