"use client";

import { useMemo } from "react";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { VoteHistoryItem } from "~~/hooks/voteHistory/shared";
import type { PlatformType } from "~~/utils/platforms";
import {
  type RecommendationSignalContext,
  type RecommendationSignalEvent,
  buildRecommendationSignalContext,
  getRecommendationSignals,
} from "~~/utils/recommendationTracker";

type ScoreMap = Map<string, number>;

export type InterestProfileStage = "anonymous" | "connected" | "voter";

export interface InterestProfile {
  stage: InterestProfileStage;
  hasPersonalizedSignals: boolean;
  totalPositiveSignals: number;
  totalVoteSignals: number;
  platformScores: ReadonlyMap<PlatformType, number>;
  categoryScores: ReadonlyMap<string, number>;
  tagScores: ReadonlyMap<string, number>;
  submitterScores: ReadonlyMap<string, number>;
  contentScores: ReadonlyMap<string, number>;
  votePlatformScores: ReadonlyMap<PlatformType, number>;
  voteCategoryScores: ReadonlyMap<string, number>;
  voteTagScores: ReadonlyMap<string, number>;
  voteSubmitterScores: ReadonlyMap<string, number>;
  voteContentScores: ReadonlyMap<string, number>;
  seenCounts: ReadonlyMap<string, number>;
}

interface BuildInterestProfileOptions {
  address?: string;
  feed: ContentItem[];
  votes: VoteHistoryItem[];
  signalVersion?: number;
}

function addWeight(map: ScoreMap, key: string, delta: number) {
  if (!key || delta === 0) return;
  map.set(key, (map.get(key) ?? 0) + delta);
}

function addSeenCount(map: Map<string, number>, key: string) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + 1);
}

function getAgeDecay(timestamp: number, nowMs: number) {
  const ageDays = Math.max(nowMs - timestamp, 0) / (24 * 60 * 60 * 1000);
  return Math.pow(0.5, ageDays / 14);
}

function getSignalWeight(event: RecommendationSignalEvent): { interest: number; vote: number; positive: boolean } {
  switch (event.type) {
    case "vote_commit":
      return { interest: 14, vote: 18, positive: true };
    case "vote_intent":
      return { interest: 8.5, vote: 11.5, positive: true };
    case "follow_toggle":
      return {
        interest: event.selected === false ? -6 : 8,
        vote: event.selected === false ? -3 : 3.5,
        positive: event.selected !== false,
      };
    case "watch_toggle":
      return {
        interest: event.selected === false ? -4.5 : 6.5,
        vote: event.selected === false ? -2 : 2.5,
        positive: event.selected !== false,
      };
    case "external_open":
      return { interest: 4.8, vote: 2.4, positive: true };
    case "dwell": {
      const dwellFactor = Math.min(Math.max((event.dwellMs ?? 0) / 14_000, 0.2), 1.5);
      return { interest: 3.2 * dwellFactor, vote: 1.15 * dwellFactor, positive: (event.dwellMs ?? 0) >= 4_500 };
    }
    case "card_open":
      return { interest: 2.2, vote: 0.9, positive: true };
    case "quick_skip":
      return { interest: -3.6, vote: -1.8, positive: false };
    case "impression":
    default:
      return { interest: 0.2, vote: 0, positive: false };
  }
}

function normalizeScoreMap<T extends string>(map: Map<T, number>): Map<T, number> {
  if (map.size === 0) return new Map();

  let maxAbs = 0;
  for (const value of map.values()) {
    maxAbs = Math.max(maxAbs, Math.abs(value));
  }

  if (maxAbs === 0) return new Map(map);

  return new Map(Array.from(map.entries(), ([key, value]) => [key, value / maxAbs] satisfies [T, number]));
}

function applySignal(
  context: RecommendationSignalContext,
  scaledInterestWeight: number,
  scaledVoteWeight: number,
  interestMaps: {
    platformScores: Map<PlatformType, number>;
    categoryScores: ScoreMap;
    tagScores: ScoreMap;
    submitterScores: ScoreMap;
    contentScores: ScoreMap;
  },
  voteMaps: {
    platformScores: Map<PlatformType, number>;
    categoryScores: ScoreMap;
    tagScores: ScoreMap;
    submitterScores: ScoreMap;
    contentScores: ScoreMap;
  },
) {
  addWeight(interestMaps.platformScores, context.platform, scaledInterestWeight);
  addWeight(interestMaps.categoryScores, context.categoryId, scaledInterestWeight * 0.85);
  addWeight(interestMaps.submitterScores, context.submitter, scaledInterestWeight * 0.75);
  addWeight(interestMaps.contentScores, context.contentId, scaledInterestWeight * 1.1);
  for (const tag of context.tags) {
    addWeight(interestMaps.tagScores, tag, scaledInterestWeight * 0.58);
  }

  addWeight(voteMaps.platformScores, context.platform, scaledVoteWeight);
  addWeight(voteMaps.categoryScores, context.categoryId, scaledVoteWeight * 0.92);
  addWeight(voteMaps.submitterScores, context.submitter, scaledVoteWeight * 0.78);
  addWeight(voteMaps.contentScores, context.contentId, scaledVoteWeight * 1.18);
  for (const tag of context.tags) {
    addWeight(voteMaps.tagScores, tag, scaledVoteWeight * 0.64);
  }
}

export function buildInterestProfile({ address, feed, votes }: BuildInterestProfileOptions): InterestProfile {
  const nowMs = Date.now();
  const signals = getRecommendationSignals().filter(signal => nowMs - signal.timestamp <= 45 * 24 * 60 * 60 * 1000);
  const feedById = new Map(feed.map(item => [item.id.toString(), item] as const));

  const interestMaps = {
    platformScores: new Map<PlatformType, number>(),
    categoryScores: new Map<string, number>(),
    tagScores: new Map<string, number>(),
    submitterScores: new Map<string, number>(),
    contentScores: new Map<string, number>(),
  };
  const voteMaps = {
    platformScores: new Map<PlatformType, number>(),
    categoryScores: new Map<string, number>(),
    tagScores: new Map<string, number>(),
    submitterScores: new Map<string, number>(),
    contentScores: new Map<string, number>(),
  };
  const seenCounts = new Map<string, number>();

  let totalPositiveSignals = 0;
  let totalVoteSignals = 0;

  for (const signal of signals) {
    const decay = getAgeDecay(signal.timestamp, nowMs);
    const weights = getSignalWeight(signal);
    const scaledInterestWeight = weights.interest * decay;
    const scaledVoteWeight = weights.vote * decay;

    applySignal(signal, scaledInterestWeight, scaledVoteWeight, interestMaps, voteMaps);

    if (signal.type === "impression" || signal.type === "card_open" || signal.type === "dwell") {
      addSeenCount(seenCounts, signal.contentId);
    }

    if (weights.positive) {
      totalPositiveSignals += 1;
    }
    if (signal.type === "vote_commit" || signal.type === "vote_intent") {
      totalVoteSignals += signal.type === "vote_commit" ? 2 : 1;
    }
  }

  for (const vote of votes) {
    totalVoteSignals += 2;
    totalPositiveSignals += 1;

    const item = feedById.get(vote.contentId.toString());
    if (!item) continue;

    const context = buildRecommendationSignalContext(item);
    const timestamp = vote.committedAt ? Date.parse(vote.committedAt) : nowMs;
    const decay = getAgeDecay(Number.isFinite(timestamp) ? timestamp : nowMs, nowMs);

    applySignal(context, 8.5 * decay, 12 * decay, interestMaps, voteMaps);
  }

  const hasPersonalizedSignals =
    votes.length > 0 ||
    totalPositiveSignals >= 2 ||
    interestMaps.tagScores.size > 0 ||
    interestMaps.platformScores.size > 0;
  const stage: InterestProfileStage =
    totalVoteSignals > 0 || votes.length > 0 ? "voter" : address ? "connected" : "anonymous";

  return {
    stage,
    hasPersonalizedSignals,
    totalPositiveSignals,
    totalVoteSignals,
    platformScores: normalizeScoreMap(interestMaps.platformScores),
    categoryScores: normalizeScoreMap(interestMaps.categoryScores),
    tagScores: normalizeScoreMap(interestMaps.tagScores),
    submitterScores: normalizeScoreMap(interestMaps.submitterScores),
    contentScores: normalizeScoreMap(interestMaps.contentScores),
    votePlatformScores: normalizeScoreMap(voteMaps.platformScores),
    voteCategoryScores: normalizeScoreMap(voteMaps.categoryScores),
    voteTagScores: normalizeScoreMap(voteMaps.tagScores),
    voteSubmitterScores: normalizeScoreMap(voteMaps.submitterScores),
    voteContentScores: normalizeScoreMap(voteMaps.contentScores),
    seenCounts,
  };
}

export function useInterestProfile({ address, feed, votes, signalVersion }: BuildInterestProfileOptions) {
  return useMemo(() => buildInterestProfile({ address, feed, votes }), [address, feed, votes, signalVersion]);
}
