"use client";

import type { ContentItem } from "~~/hooks/useContentFeed";
import type { InterestProfile } from "~~/hooks/useInterestProfile";
import { DEFAULT_VOTING_CONFIG } from "~~/lib/contracts/roundVotingEngine";
import { detectPlatform } from "~~/utils/platforms";

interface RankForYouFeedOptions {
  nowSeconds: number;
  profile: InterestProfile;
  votedContentIds: Set<string>;
  watchedContentIds: Set<string>;
  followedWallets: Set<string>;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

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

function getRecencyScore(timestampSeconds: number | null, nowSeconds: number, windowSeconds: number) {
  if (!timestampSeconds) return 0;
  const age = Math.max(nowSeconds - timestampSeconds, 0);
  return clamp01(1 - age / windowSeconds);
}

function getLogScore(value: number, ceiling: number) {
  if (value <= 0) return 0;
  return clamp01(Math.log1p(value) / Math.log1p(ceiling));
}

function getRoundCloseness(item: ContentItem) {
  const openRound = item.openRound;
  if (!openRound) return 0;

  const largerPool = openRound.upPool > openRound.downPool ? openRound.upPool : openRound.downPool;
  const smallerPool = openRound.upPool > openRound.downPool ? openRound.downPool : openRound.upPool;

  if (largerPool > 0n) {
    return Number((smallerPool * 1_000n) / largerPool) / 1_000;
  }

  return openRound.voteCount >= 2 ? 0.35 : 0;
}

function getRoundMinVoters(item: ContentItem) {
  return item.openRound?.minVoters ?? item.roundConfig?.minVoters ?? DEFAULT_VOTING_CONFIG.minVoters;
}

function getRoundMaxDuration(item: ContentItem) {
  return item.openRound?.maxDuration ?? item.roundConfig?.maxDuration ?? DEFAULT_VOTING_CONFIG.maxDuration;
}

function getTrendingOpportunity(item: ContentItem, nowSeconds: number) {
  const activitySeconds = parseTimestampSeconds(item.lastActivityAt ?? item.createdAt);
  const recency = getRecencyScore(activitySeconds, nowSeconds, 7 * 24 * 60 * 60);
  const voteScore = getLogScore(item.totalVotes, 36);
  const roundScore = getLogScore(item.totalRounds, 10);
  const openRoundBoost = item.openRound
    ? 0.45 + 0.55 * Math.min(item.openRound.voteCount / Math.max(getRoundMinVoters(item), 1), 1)
    : 0;

  return clamp01(recency * 0.42 + voteScore * 0.28 + roundScore * 0.1 + openRoundBoost * 0.2);
}

function getFreshOpportunity(item: ContentItem, nowSeconds: number) {
  const createdAtSeconds = parseTimestampSeconds(item.createdAt);
  const freshness = getRecencyScore(createdAtSeconds, nowSeconds, 14 * 24 * 60 * 60);
  const lowVoteBonus = 1 - Math.min(item.totalVotes / 12, 1);
  const lowRoundBonus = 1 - Math.min(item.totalRounds / 4, 1);
  const openRoundBoost = item.openRound ? 0.12 : 0;

  return clamp01(freshness * 0.52 + lowVoteBonus * 0.28 + lowRoundBonus * 0.12 + openRoundBoost * 0.08);
}

function getNearSettlementOpportunity(item: ContentItem, nowSeconds: number) {
  const openRound = item.openRound;
  if (!openRound) return 0;

  const estimatedSettlementTime = openRound.estimatedSettlementTime ? Number(openRound.estimatedSettlementTime) : null;
  const secondsUntilSettlement = estimatedSettlementTime
    ? Math.max(estimatedSettlementTime - nowSeconds, 0)
    : getRoundMaxDuration(item) * 2;
  const timingScore = estimatedSettlementTime ? 1 / (1 + secondsUntilSettlement / 3600) : 0;
  const voteReadiness = Math.min(openRound.voteCount / Math.max(getRoundMinVoters(item), 1), 1.5);
  const revealProgress = Math.min(openRound.revealedCount / Math.max(openRound.voteCount, 1), 1);
  const contestedBoost = getRoundCloseness(item) * 0.3;

  return clamp01(timingScore * 0.48 + voteReadiness * 0.27 + revealProgress * 0.15 + contestedBoost * 0.1);
}

function getQualityScore(item: ContentItem) {
  const ratingScore = clamp01(item.rating / 100);
  const confidence = getLogScore(item.totalVotes + item.totalRounds * 2, 48);
  return clamp01(ratingScore * 0.72 + confidence * 0.28);
}

function getMapValue(map: ReadonlyMap<string, number> | ReadonlyMap<any, number>, key: string) {
  const value = map.get(key as never);
  return typeof value === "number" ? value : 0;
}

function getTagAffinity(tags: string[], tagScores: ReadonlyMap<string, number>) {
  if (tags.length === 0) return 0;
  return tags.reduce((best, tag) => Math.max(best, getMapValue(tagScores, tag.toLowerCase())), 0);
}

function getInterestAffinity(item: ContentItem, profile: InterestProfile) {
  const platform = detectPlatform(item.url).type;
  const direct = getMapValue(profile.contentScores, item.id.toString());
  const platformScore = getMapValue(profile.platformScores, platform);
  const categoryScore = getMapValue(profile.categoryScores, item.categoryId.toString());
  const submitterScore = getMapValue(profile.submitterScores, item.submitter.toLowerCase());
  const tagScore = getTagAffinity(item.tags, profile.tagScores);

  return clamp01(direct * 0.26 + platformScore * 0.24 + categoryScore * 0.22 + tagScore * 0.18 + submitterScore * 0.1);
}

function getVoteAffinity(item: ContentItem, profile: InterestProfile) {
  const platform = detectPlatform(item.url).type;
  const direct = getMapValue(profile.voteContentScores, item.id.toString());
  const platformScore = getMapValue(profile.votePlatformScores, platform);
  const categoryScore = getMapValue(profile.voteCategoryScores, item.categoryId.toString());
  const submitterScore = getMapValue(profile.voteSubmitterScores, item.submitter.toLowerCase());
  const tagScore = getTagAffinity(item.tags, profile.voteTagScores);

  return clamp01(direct * 0.28 + platformScore * 0.24 + categoryScore * 0.22 + tagScore * 0.16 + submitterScore * 0.1);
}

function getVoteOpportunityScore(item: ContentItem, nowSeconds: number, hasVoted: boolean) {
  const freshOpportunity = getFreshOpportunity(item, nowSeconds);
  const nearSettlement = getNearSettlementOpportunity(item, nowSeconds);
  const openRound = item.openRound;
  const openRoundBoost = openRound ? 0.28 : 0;
  const notVotedBoost = hasVoted ? 0 : 0.26;
  const quorumNeedBoost = openRound
    ? 1 - Math.min(openRound.voteCount / Math.max(getRoundMinVoters(item), 1), 1)
    : freshOpportunity * 0.7;

  return clamp01(
    openRoundBoost + notVotedBoost + quorumNeedBoost * 0.26 + nearSettlement * 0.12 + freshOpportunity * 0.08,
  );
}

function getWatchFollowBoost(
  item: ContentItem,
  options: Pick<RankForYouFeedOptions, "watchedContentIds" | "followedWallets">,
) {
  const watchedBoost = options.watchedContentIds.has(item.id.toString()) ? 0.32 : 0;
  const followedBoost = options.followedWallets.has(item.submitter.toLowerCase()) ? 0.28 : 0;
  return clamp01(watchedBoost + followedBoost);
}

function getColdStartBlend(item: ContentItem, nowSeconds: number) {
  const fresh = getFreshOpportunity(item, nowSeconds);
  const trending = getTrendingOpportunity(item, nowSeconds);
  const nearSettlement = getNearSettlementOpportunity(item, nowSeconds);
  const quality = getQualityScore(item);

  return clamp01(fresh * 0.35 + trending * 0.25 + nearSettlement * 0.2 + quality * 0.2);
}

function getExplorationBonus(item: ContentItem, profile: InterestProfile) {
  const platform = detectPlatform(item.url).type;
  const platformAffinity = getMapValue(profile.platformScores, platform);
  const tagAffinity = getTagAffinity(item.tags, profile.tagScores);
  const exploration = Math.max(0, 0.22 - platformAffinity * 0.12 - tagAffinity * 0.08);
  return clamp01(exploration);
}

function scoreForYouItem(item: ContentItem, options: RankForYouFeedOptions) {
  const { nowSeconds, profile, votedContentIds } = options;
  const hasVoted = votedContentIds.has(item.id.toString());
  const interest = getInterestAffinity(item, profile);
  const voteAffinity = getVoteAffinity(item, profile);
  const votePropensity = clamp01(voteAffinity * 0.72 + interest * 0.28 + getWatchFollowBoost(item, options) * 0.25);
  const voteOpportunity = getVoteOpportunityScore(item, nowSeconds, hasVoted);
  const quality = getQualityScore(item);
  const coldStartBlend = getColdStartBlend(item, nowSeconds);
  const watchFollowBoost = getWatchFollowBoost(item, options);
  const exploration = getExplorationBonus(item, profile);

  let score: number;
  switch (profile.stage) {
    case "voter":
      score = votePropensity * 0.4 + voteOpportunity * 0.28 + interest * 0.14 + quality * 0.1 + coldStartBlend * 0.08;
      break;
    case "connected":
      score = interest * 0.3 + voteOpportunity * 0.28 + watchFollowBoost * 0.18 + quality * 0.14 + coldStartBlend * 0.1;
      break;
    case "anonymous":
    default:
      if (!profile.hasPersonalizedSignals) {
        score =
          coldStartBlend * 0.34 +
          voteOpportunity * 0.26 +
          quality * 0.18 +
          getFreshOpportunity(item, nowSeconds) * 0.14 +
          exploration * 0.08;
      } else {
        score =
          interest * 0.34 + coldStartBlend * 0.22 + voteOpportunity * 0.2 + quality * 0.14 + watchFollowBoost * 0.1;
      }
      break;
  }

  let penalty = 0;
  const seenCount = options.profile.seenCounts.get(item.id.toString()) ?? 0;
  if (hasVoted) penalty += 0.72;
  if (item.isOwnContent) penalty += 0.44;
  if (seenCount > 1) penalty += Math.min((seenCount - 1) * 0.08, 0.28);

  return score - penalty;
}

export function rankForYouFeed(items: ContentItem[], options: RankForYouFeedOptions) {
  const scored = items
    .map(item => ({
      item,
      platform: detectPlatform(item.url).type,
      score: scoreForYouItem(item, options),
    }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return Number(b.item.id - a.item.id);
    });

  const diversified: typeof scored = [];
  const remaining = [...scored];
  const platformCounts = new Map<string, number>();
  const submitterCounts = new Map<string, number>();

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestAdjustedScore = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < remaining.length; index++) {
      const candidate = remaining[index];
      const platformPenalty = (platformCounts.get(candidate.platform) ?? 0) * 0.045;
      const submitterPenalty = (submitterCounts.get(candidate.item.submitter.toLowerCase()) ?? 0) * 0.06;
      const adjustedScore = candidate.score - platformPenalty - submitterPenalty;

      if (adjustedScore > bestAdjustedScore) {
        bestAdjustedScore = adjustedScore;
        bestIndex = index;
      }
    }

    const [nextCandidate] = remaining.splice(bestIndex, 1);
    diversified.push(nextCandidate);
    platformCounts.set(nextCandidate.platform, (platformCounts.get(nextCandidate.platform) ?? 0) + 1);
    submitterCounts.set(
      nextCandidate.item.submitter.toLowerCase(),
      (submitterCounts.get(nextCandidate.item.submitter.toLowerCase()) ?? 0) + 1,
    );
  }

  return diversified.map(entry => entry.item);
}
