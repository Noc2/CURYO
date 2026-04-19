"use client";

import type { ContentItem } from "~~/hooks/useContentFeed";
import { DEFAULT_VOTING_CONFIG } from "~~/lib/contracts/roundVotingEngine";

export type DiscoverFeedMode = "for_you" | "trending" | "highest_rewards" | "contested" | "latest" | "near_settlement";

interface DiscoverFeedModeOption {
  value: DiscoverFeedMode;
  label: string;
  description: string;
}

export const DISCOVER_FEED_MODE_OPTIONS: DiscoverFeedModeOption[] = [
  {
    value: "for_you",
    label: "For You",
    description: "Ranked by your recent interactions, saved items, and vote history.",
  },
  {
    value: "trending",
    label: "Trending",
    description: "Most active content right now, weighted by recent feed momentum.",
  },
  {
    value: "highest_rewards",
    label: "Top Bounties",
    description: "Content with the largest available USDC bounties.",
  },
  {
    value: "contested",
    label: "Contested",
    description: "Open rounds with the closest split between up and down stake.",
  },
  {
    value: "latest",
    label: "Latest",
    description: "Newest submissions, sorted by when they were added.",
  },
  {
    value: "near_settlement",
    label: "Near Settlement",
    description: "Open rounds likely to resolve soon.",
  },
];

const TRENDING_WINDOW_SECONDS = 7 * 24 * 60 * 60;
function parseTimestampSeconds(value: string | null | undefined): number | null {
  if (!value) return null;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }

  const parsed = Date.parse(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed / 1000);
  }

  return null;
}

function getRecencyScore(timestampSeconds: number | null, nowSeconds: number, windowSeconds: number): number {
  if (!timestampSeconds) return 0;
  const age = Math.max(nowSeconds - timestampSeconds, 0);
  return Math.max(0, 1 - age / windowSeconds);
}

function getLogScore(value: number, ceiling: number): number {
  if (value <= 0) return 0;
  return Math.min(1, Math.log1p(value) / Math.log1p(ceiling));
}

function getRoundCloseness(item: ContentItem): number {
  const openRound = item.openRound;
  if (!openRound) return 0;

  const largerPool = openRound.upPool > openRound.downPool ? openRound.upPool : openRound.downPool;
  const smallerPool = openRound.upPool > openRound.downPool ? openRound.downPool : openRound.upPool;

  if (largerPool > 0n) {
    return Number((smallerPool * 1_000n) / largerPool) / 1_000;
  }

  if (openRound.voteCount >= 2) {
    return 0.35;
  }

  return 0;
}

function getRewardPoolAmount(item: ContentItem) {
  return item.rewardPoolSummary?.totalAvailable ?? item.rewardPoolSummary?.totalFunded ?? 0n;
}

function getRoundMinVoters(item: ContentItem) {
  return item.openRound?.minVoters ?? item.roundConfig?.minVoters ?? DEFAULT_VOTING_CONFIG.minVoters;
}

function getRoundMaxDuration(item: ContentItem) {
  return item.openRound?.maxDuration ?? item.roundConfig?.maxDuration ?? DEFAULT_VOTING_CONFIG.maxDuration;
}

function compareRewardPoolAmountDesc(a: ContentItem, b: ContentItem) {
  const aAmount = getRewardPoolAmount(a);
  const bAmount = getRewardPoolAmount(b);
  if (aAmount === bAmount) return 0;
  return aAmount > bAmount ? -1 : 1;
}

function getTrendingScore(item: ContentItem, nowSeconds: number): number {
  const activitySeconds = parseTimestampSeconds(item.lastActivityAt ?? item.createdAt);
  const recency = getRecencyScore(activitySeconds, nowSeconds, TRENDING_WINDOW_SECONDS);
  const voteScore = getLogScore(item.totalVotes, 32);
  const roundScore = getLogScore(item.totalRounds, 10);
  const openRoundBoost = item.openRound
    ? 0.45 + 0.55 * Math.min(item.openRound.voteCount / Math.max(getRoundMinVoters(item), 1), 1)
    : 0;

  return recency * 1.35 + voteScore * 1.15 + roundScore * 0.55 + openRoundBoost * 0.8;
}

function getContestedScore(item: ContentItem, nowSeconds: number): number {
  const openRound = item.openRound;
  if (!openRound) return Number.NEGATIVE_INFINITY;

  const closeness = getRoundCloseness(item);
  const participation = Math.min(openRound.voteCount / Math.max(getRoundMinVoters(item) * 2, 1), 1);
  const revealDepth = Math.min(openRound.revealedCount / Math.max(openRound.voteCount, 1), 1);
  const roundStartSeconds = openRound.startTime ? Number(openRound.startTime) : null;
  const recency = getRecencyScore(roundStartSeconds, nowSeconds, TRENDING_WINDOW_SECONDS);

  return closeness * 2.2 + participation * 0.9 + revealDepth * 0.5 + recency * 0.35;
}

function getNearSettlementScore(item: ContentItem, nowSeconds: number): number {
  const openRound = item.openRound;
  if (!openRound) return Number.NEGATIVE_INFINITY;

  const estimatedSettlementTime = openRound.estimatedSettlementTime ? Number(openRound.estimatedSettlementTime) : null;
  const secondsUntilSettlement = estimatedSettlementTime
    ? Math.max(estimatedSettlementTime - nowSeconds, 0)
    : getRoundMaxDuration(item) * 2;
  const timingScore = estimatedSettlementTime ? 1 / (1 + secondsUntilSettlement / 3600) : 0;
  const voteReadiness = Math.min(openRound.voteCount / Math.max(getRoundMinVoters(item), 1), 1.5);
  const revealProgress = Math.min(openRound.revealedCount / Math.max(openRound.voteCount, 1), 1);
  const contestedBoost = getRoundCloseness(item) * 0.3;

  return timingScore * 1.8 + voteReadiness + revealProgress * 0.6 + contestedBoost;
}

function compareTimestampDesc(a: ContentItem, b: ContentItem) {
  const aTime = parseTimestampSeconds(a.lastActivityAt ?? a.createdAt) ?? 0;
  const bTime = parseTimestampSeconds(b.lastActivityAt ?? b.createdAt) ?? 0;
  if (aTime !== bTime) return bTime - aTime;
  return Number(b.id - a.id);
}

function compareCreatedAtDesc(a: ContentItem, b: ContentItem) {
  const aTime = parseTimestampSeconds(a.createdAt) ?? 0;
  const bTime = parseTimestampSeconds(b.createdAt) ?? 0;
  if (aTime !== bTime) return bTime - aTime;
  return Number(b.id - a.id);
}

export function sortDiscoverFeed(items: ContentItem[], mode: Exclude<DiscoverFeedMode, "for_you">, nowSeconds: number) {
  const ranked = items
    .filter(item => {
      if (mode === "contested" || mode === "near_settlement") {
        return item.openRound !== null;
      }
      if (mode === "highest_rewards") {
        return getRewardPoolAmount(item) > 0n;
      }
      return true;
    })
    .map(item => {
      switch (mode) {
        case "trending":
          return { item, score: getTrendingScore(item, nowSeconds) };
        case "highest_rewards":
          return { item, score: 0 };
        case "contested":
          return { item, score: getContestedScore(item, nowSeconds) };
        case "latest":
          return { item, score: 0 };
        case "near_settlement":
          return { item, score: getNearSettlementScore(item, nowSeconds) };
      }
    })
    .sort((a, b) => {
      if (mode === "latest") {
        return compareCreatedAtDesc(a.item, b.item);
      }
      if (mode === "highest_rewards") {
        const rewardDifference = compareRewardPoolAmountDesc(a.item, b.item);
        if (rewardDifference !== 0) return rewardDifference;

        const activePoolDifference =
          (b.item.rewardPoolSummary?.activeRewardPoolCount ?? 0) -
          (a.item.rewardPoolSummary?.activeRewardPoolCount ?? 0);
        if (activePoolDifference !== 0) return activePoolDifference;

        return compareTimestampDesc(a.item, b.item);
      }
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return compareTimestampDesc(a.item, b.item);
    });

  return ranked.map(entry => entry.item);
}
