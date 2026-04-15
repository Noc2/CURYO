import { DEFAULT_REVEAL_GRACE_PERIOD_SECONDS, DEFAULT_ROUND_CONFIG, ROUND_STATE } from "@curyo/contracts/protocol";
import type { Context, Hono } from "hono";
import { and, desc, eq, inArray, replaceBigInts, sql } from "ponder";
import { db } from "ponder:api";
import { questionBounty, round } from "ponder:schema";
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

export function getEstimatedSettlementTime(startTime: bigint | null | undefined) {
  if (startTime === null || startTime === undefined) return null;

  return (
    startTime
    + BigInt(DEFAULT_ROUND_CONFIG.epochDurationSeconds)
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
      bountySummary: emptyBountySummary(),
      openRound: null,
    }));
  }

  const contentIds = items.map(item => item.id);
  const bountyRows = await db
    .select({
      contentId: questionBounty.contentId,
      bountyCount: sql<number>`count(*)`,
      activeBountyCount: sql<number>`sum(case when ${questionBounty.refunded} = false and ${questionBounty.qualifiedRounds} < ${questionBounty.requiredSettledRounds} then 1 else 0 end)`,
      totalFundedAmount: sql<bigint>`coalesce(sum(${questionBounty.fundedAmount}), 0)`,
      totalUnallocatedAmount: sql<bigint>`coalesce(sum(${questionBounty.unallocatedAmount}), 0)`,
      totalAllocatedAmount: sql<bigint>`coalesce(sum(${questionBounty.allocatedAmount}), 0)`,
      totalClaimedAmount: sql<bigint>`coalesce(sum(${questionBounty.claimedAmount}), 0)`,
      totalRefundedAmount: sql<bigint>`coalesce(sum(${questionBounty.refundedAmount}), 0)`,
      qualifiedRoundCount: sql<number>`coalesce(sum(${questionBounty.qualifiedRounds}), 0)`,
    })
    .from(questionBounty)
    .where(inArray(questionBounty.contentId, contentIds))
    .groupBy(questionBounty.contentId);

  const bountySummaryByContentId = new Map<bigint, ReturnType<typeof formatBountySummary>>();
  for (const row of bountyRows) {
    bountySummaryByContentId.set(row.contentId, formatBountySummary(row));
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
    const bountySummary = bountySummaryByContentId.get(item.id) ?? emptyBountySummary();

    return {
      ...item,
      contentId: item.id,
      question: "title" in item ? item.title : undefined,
      link: "url" in item ? item.url || null : undefined,
      bountySummary,
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
            estimatedSettlementTime: getEstimatedSettlementTime(openRound.startTime),
          }
        : null,
    };
  });
}

function emptyBountySummary() {
  return {
    currency: "USDC",
    displayCurrency: "USD",
    decimals: 6,
    bountyCount: 0,
    activeBountyCount: 0,
    totalFundedAmount: 0n,
    totalUnallocatedAmount: 0n,
    totalAllocatedAmount: 0n,
    totalClaimedAmount: 0n,
    totalRefundedAmount: 0n,
    qualifiedRoundCount: 0,
    currentBountyAmount: 0n,
  };
}

function toBigIntValue(value: bigint | string | number | null | undefined) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string" && value.length > 0) return BigInt(value);
  return 0n;
}

function toNumberValue(value: number | string | bigint | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string" && value.length > 0) return Number(value);
  return 0;
}

function formatBountySummary(row: {
  bountyCount: number | string | bigint | null;
  activeBountyCount: number | string | bigint | null;
  totalFundedAmount: bigint | string | number | null;
  totalUnallocatedAmount: bigint | string | number | null;
  totalAllocatedAmount: bigint | string | number | null;
  totalClaimedAmount: bigint | string | number | null;
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
    bountyCount: toNumberValue(row.bountyCount),
    activeBountyCount: toNumberValue(row.activeBountyCount),
    totalFundedAmount: toBigIntValue(row.totalFundedAmount),
    totalUnallocatedAmount,
    totalAllocatedAmount,
    totalClaimedAmount,
    totalRefundedAmount: toBigIntValue(row.totalRefundedAmount),
    qualifiedRoundCount: toNumberValue(row.qualifiedRoundCount),
    currentBountyAmount: totalUnallocatedAmount + totalAllocatedAmount - totalClaimedAmount,
  };
}
