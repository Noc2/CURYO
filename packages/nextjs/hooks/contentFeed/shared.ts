"use client";

import { parseTags } from "~~/constants/categories";
import { type ContentMediaItem, buildFallbackMediaItems } from "~~/lib/contentMedia";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import { DEFAULT_VOTING_CONFIG, type VotingConfig } from "~~/lib/contracts/roundVotingEngine";
import { isContentItemBlocked } from "~~/utils/contentFilter";

export const MIN_CONTENT_SEARCH_QUERY_LENGTH = 3;

const LIKELY_URL_SEARCH_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#:].*)?$/i;

export interface ContentOpenRoundSummary {
  roundId: bigint;
  voteCount: number;
  revealedCount: number;
  totalStake: bigint;
  upPool: bigint;
  downPool: bigint;
  upCount?: number;
  downCount?: number;
  referenceRatingBps?: bigint;
  ratingBps?: bigint;
  conservativeRatingBps?: bigint;
  confidenceMass?: bigint;
  effectiveEvidence?: bigint;
  settledRounds?: number;
  lowSince?: bigint;
  startTime: bigint | null;
  epochDuration?: number;
  maxDuration?: number;
  minVoters?: number;
  maxVoters?: number;
  estimatedSettlementTime: bigint | null;
}

export interface ContentItem {
  id: bigint;
  url: string;
  media: ContentMediaItem[];
  question?: string;
  title: string;
  description: string;
  tags: string[];
  submitter: string;
  contentHash: string;
  questionMetadataHash?: string | null;
  resultSpecHash?: string | null;
  isOwnContent: boolean;
  categoryId: bigint;
  rating: number;
  ratingBps?: bigint;
  conservativeRatingBps?: bigint;
  createdAt: string | null;
  lastActivityAt: string | null;
  totalVotes: number;
  totalRounds: number;
  bundleId?: bigint | null;
  bundleIndex?: number | null;
  bundle?: {
    id: bigint;
    questionCount: number;
    requiredCompleters: number;
    requiredSettledRounds: number;
    completedRoundSetCount: number;
    totalRecordedQuestionRounds: number;
    claimedCount: number;
    fundedAmount: bigint;
    unallocatedAmount: bigint;
    allocatedAmount: bigint;
    claimedAmount: bigint;
    refundedAmount: bigint;
    bountyClosesAt?: bigint;
    feedbackClosesAt?: bigint;
    expiresAt?: bigint;
    failed: boolean;
    refunded: boolean;
  } | null;
  roundConfig?: VotingConfig | null;
  openRound: ContentOpenRoundSummary | null;
  isValidUrl: boolean | null;
  thumbnailUrl: string | null;
  contentMetadata?: ContentMetadataResult;
  rewardPoolSummary?: {
    totalFunded: bigint;
    totalAvailable: bigint;
    totalClaimed?: bigint;
    totalVoterClaimed?: bigint;
    totalFrontendClaimed?: bigint;
    activeRewardPoolCount: number;
    expiredRewardPoolCount?: number;
    hasActiveBounty?: boolean;
    nextBountyClosesAt?: bigint | null;
    nextFeedbackClosesAt?: bigint | null;
  } | null;
  feedbackBonusSummary?: {
    totalFunded: bigint;
    totalRemaining: bigint;
    totalAwarded: bigint;
    totalVoterAwarded?: bigint;
    totalFrontendAwarded?: bigint;
    totalForfeited?: bigint;
    activePoolCount: number;
    expiredPoolCount?: number;
    awardCount: number;
    hasActiveFeedbackBonus?: boolean;
    nextFeedbackClosesAt?: bigint | null;
  } | null;
}

export type FeedSort =
  | "newest"
  | "oldest"
  | "highest_rewards"
  | "highest_rated"
  | "lowest_rated"
  | "most_votes"
  | "relevance";

export interface UseContentFeedOptions {
  categoryId?: bigint;
  contentIds?: bigint[];
  enabled?: boolean;
  keepPrevious?: boolean;
  limit?: number;
  offset?: number;
  ownSubmitterAddresses?: string[];
  searchQuery?: string;
  sortBy?: FeedSort;
  submitter?: string;
  submitters?: string[];
}

function buildNormalizedAddressSet(addresses: readonly string[] | undefined, fallbackAddress?: string): Set<string> {
  const values = new Set<string>();

  const addAddress = (address?: string) => {
    const trimmed = address?.trim();
    if (!trimmed) return;
    values.add(trimmed.toLowerCase());
  };

  addAddress(fallbackAddress);
  addresses?.forEach(addAddress);

  return values;
}

function numberOrDefault(value: string | number | null | undefined, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function mapContentItem(
  item: {
    id: string;
    url?: string | null;
    media?: Array<{
      index?: number;
      mediaIndex?: number;
      mediaType?: "image" | "video";
      url?: string | null;
      canonicalUrl?: string | null;
      urlHost?: string | null;
    }> | null;
    question?: string | null;
    title: string;
    description: string;
    tags: string;
    submitter: string;
    contentHash: string;
    questionMetadataHash?: string | null;
    resultSpecHash?: string | null;
    categoryId: string;
    rating: number;
    ratingBps?: number;
    conservativeRatingBps?: number;
    createdAt?: string | null;
    lastActivityAt?: string | null;
    totalVotes?: number;
    totalRounds?: number;
    bundleId?: string | number | null;
    bundleIndex?: number | null;
    bundle?: {
      id?: string | number | null;
      questionCount?: number | null;
      requiredCompleters?: number | null;
      requiredSettledRounds?: number | null;
      completedRoundSetCount?: number | null;
      totalRecordedQuestionRounds?: number | null;
      claimedCount?: number | null;
      fundedAmount?: string | number | bigint | null;
      unallocatedAmount?: string | number | bigint | null;
      allocatedAmount?: string | number | bigint | null;
      claimedAmount?: string | number | bigint | null;
      refundedAmount?: string | number | bigint | null;
      bountyClosesAt?: string | number | bigint | null;
      feedbackClosesAt?: string | number | bigint | null;
      expiresAt?: string | number | bigint | null;
      failed?: boolean | null;
      refunded?: boolean | null;
    } | null;
    roundEpochDuration?: string | number | null;
    roundMaxDuration?: string | number | null;
    roundMinVoters?: string | number | null;
    roundMaxVoters?: string | number | null;
    openRound?: {
      roundId: string;
      voteCount: number;
      revealedCount: number;
      totalStake: string;
      upPool: string;
      downPool: string;
      upCount?: number;
      downCount?: number;
      referenceRatingBps?: number;
      ratingBps?: number;
      conservativeRatingBps?: number;
      confidenceMass?: string;
      effectiveEvidence?: string;
      settledRounds?: number;
      lowSince?: string;
      startTime: string | null;
      epochDuration?: number;
      maxDuration?: number;
      minVoters?: number;
      maxVoters?: number;
      estimatedSettlementTime: string | null;
    } | null;
    rewardPoolSummary?: {
      totalFunded?: string | number | bigint | null;
      totalFundedAmount?: string | number | bigint | null;
      totalAvailable?: string | number | bigint | null;
      currentRewardPoolAmount?: string | number | bigint | null;
      totalClaimedAmount?: string | number | bigint | null;
      totalVoterClaimedAmount?: string | number | bigint | null;
      totalFrontendClaimedAmount?: string | number | bigint | null;
      activeRewardPoolCount?: number | null;
      expiredRewardPoolCount?: number | null;
      hasActiveBounty?: boolean | null;
      nextBountyClosesAt?: string | number | bigint | null;
      nextFeedbackClosesAt?: string | number | bigint | null;
    } | null;
    feedbackBonusSummary?: {
      totalFunded?: string | number | bigint | null;
      totalFundedAmount?: string | number | bigint | null;
      totalRemaining?: string | number | bigint | null;
      totalRemainingAmount?: string | number | bigint | null;
      activeRemainingAmount?: string | number | bigint | null;
      totalAwarded?: string | number | bigint | null;
      totalAwardedAmount?: string | number | bigint | null;
      totalVoterAwardedAmount?: string | number | bigint | null;
      totalFrontendAwardedAmount?: string | number | bigint | null;
      totalForfeitedAmount?: string | number | bigint | null;
      activePoolCount?: number | null;
      expiredPoolCount?: number | null;
      awardCount?: number | null;
      hasActiveFeedbackBonus?: boolean | null;
      nextFeedbackClosesAt?: string | number | bigint | null;
    } | null;
  },
  voterAddress?: string,
  ownSubmitterAddresses?: readonly string[],
): ContentItem {
  const ownSubmitterAddressSet = buildNormalizedAddressSet(ownSubmitterAddresses, voterAddress);
  const roundConfig = {
    epochDuration: numberOrDefault(item.roundEpochDuration, DEFAULT_VOTING_CONFIG.epochDuration),
    maxDuration: numberOrDefault(item.roundMaxDuration, DEFAULT_VOTING_CONFIG.maxDuration),
    minVoters: numberOrDefault(item.roundMinVoters, DEFAULT_VOTING_CONFIG.minVoters),
    maxVoters: numberOrDefault(item.roundMaxVoters, DEFAULT_VOTING_CONFIG.maxVoters),
  };
  const mappedOpenRound = item.openRound
    ? {
        roundId: BigInt(item.openRound.roundId),
        voteCount: item.openRound.voteCount,
        revealedCount: item.openRound.revealedCount,
        totalStake: BigInt(item.openRound.totalStake),
        upPool: BigInt(item.openRound.upPool),
        downPool: BigInt(item.openRound.downPool),
        upCount: item.openRound.upCount,
        downCount: item.openRound.downCount,
        referenceRatingBps:
          item.openRound.referenceRatingBps !== undefined ? BigInt(item.openRound.referenceRatingBps) : undefined,
        ratingBps: item.openRound.ratingBps !== undefined ? BigInt(item.openRound.ratingBps) : undefined,
        conservativeRatingBps:
          item.openRound.conservativeRatingBps !== undefined ? BigInt(item.openRound.conservativeRatingBps) : undefined,
        confidenceMass: item.openRound.confidenceMass !== undefined ? BigInt(item.openRound.confidenceMass) : undefined,
        effectiveEvidence:
          item.openRound.effectiveEvidence !== undefined ? BigInt(item.openRound.effectiveEvidence) : undefined,
        settledRounds: item.openRound.settledRounds,
        lowSince: item.openRound.lowSince !== undefined ? BigInt(item.openRound.lowSince) : undefined,
        startTime: item.openRound.startTime ? BigInt(item.openRound.startTime) : null,
        epochDuration: numberOrDefault(item.openRound.epochDuration, roundConfig.epochDuration),
        maxDuration: numberOrDefault(item.openRound.maxDuration, roundConfig.maxDuration),
        minVoters: numberOrDefault(item.openRound.minVoters, roundConfig.minVoters),
        maxVoters: numberOrDefault(item.openRound.maxVoters, roundConfig.maxVoters),
        estimatedSettlementTime: item.openRound.estimatedSettlementTime
          ? BigInt(item.openRound.estimatedSettlementTime)
          : null,
      }
    : null;
  const ratingBps = item.ratingBps !== undefined ? BigInt(item.ratingBps) : undefined;
  const conservativeRatingBps =
    item.conservativeRatingBps !== undefined ? BigInt(item.conservativeRatingBps) : undefined;
  const displayedRating =
    mappedOpenRound?.referenceRatingBps !== undefined ? Number(mappedOpenRound.referenceRatingBps) / 100 : item.rating;
  const url = item.url ?? "";
  const media = (item.media ?? [])
    .filter(mediaItem => mediaItem.url)
    .map((mediaItem, index) => ({
      mediaIndex: mediaItem.mediaIndex ?? mediaItem.index ?? index,
      mediaType: mediaItem.mediaType ?? "image",
      url: mediaItem.url ?? "",
      canonicalUrl: mediaItem.canonicalUrl ?? mediaItem.url ?? "",
      urlHost: mediaItem.urlHost ?? null,
    }));

  return {
    id: BigInt(item.id),
    url,
    media: media.length > 0 ? media : buildFallbackMediaItems(url),
    question: item.question?.trim() || item.title,
    title: item.title,
    description: item.description,
    tags: parseTags(item.tags),
    submitter: item.submitter,
    contentHash: item.contentHash,
    questionMetadataHash: item.questionMetadataHash ?? null,
    resultSpecHash: item.resultSpecHash ?? null,
    isOwnContent: ownSubmitterAddressSet.has(item.submitter.toLowerCase()),
    categoryId: BigInt(item.categoryId),
    rating: displayedRating,
    ratingBps,
    conservativeRatingBps,
    createdAt: item.createdAt ?? null,
    lastActivityAt: item.lastActivityAt ?? null,
    totalVotes: item.totalVotes ?? 0,
    totalRounds: item.totalRounds ?? 0,
    bundleId: item.bundleId !== undefined && item.bundleId !== null ? BigInt(item.bundleId) : null,
    bundleIndex: item.bundleIndex ?? null,
    bundle:
      item.bundle && item.bundle.id !== undefined && item.bundle.id !== null
        ? {
            id: BigInt(item.bundle.id),
            questionCount: item.bundle.questionCount ?? 0,
            requiredCompleters: item.bundle.requiredCompleters ?? 0,
            requiredSettledRounds: item.bundle.requiredSettledRounds ?? 1,
            completedRoundSetCount: item.bundle.completedRoundSetCount ?? 0,
            totalRecordedQuestionRounds: item.bundle.totalRecordedQuestionRounds ?? 0,
            claimedCount: item.bundle.claimedCount ?? 0,
            fundedAmount: BigInt(item.bundle.fundedAmount ?? 0),
            unallocatedAmount: BigInt(item.bundle.unallocatedAmount ?? 0),
            allocatedAmount: BigInt(item.bundle.allocatedAmount ?? 0),
            claimedAmount: BigInt(item.bundle.claimedAmount ?? 0),
            refundedAmount: BigInt(item.bundle.refundedAmount ?? 0),
            bountyClosesAt: BigInt(item.bundle.bountyClosesAt ?? 0),
            feedbackClosesAt: BigInt(item.bundle.feedbackClosesAt ?? 0),
            expiresAt: BigInt(item.bundle.expiresAt ?? 0),
            failed: item.bundle.failed ?? false,
            refunded: item.bundle.refunded ?? false,
          }
        : null,
    roundConfig,
    openRound: mappedOpenRound,
    isValidUrl: null,
    thumbnailUrl: null,
    rewardPoolSummary: item.rewardPoolSummary
      ? {
          totalFunded: BigInt(item.rewardPoolSummary.totalFunded ?? item.rewardPoolSummary.totalFundedAmount ?? 0),
          totalAvailable: BigInt(
            item.rewardPoolSummary.totalAvailable ?? item.rewardPoolSummary.currentRewardPoolAmount ?? 0,
          ),
          totalClaimed: BigInt(item.rewardPoolSummary.totalClaimedAmount ?? 0),
          totalVoterClaimed: BigInt(item.rewardPoolSummary.totalVoterClaimedAmount ?? 0),
          totalFrontendClaimed: BigInt(item.rewardPoolSummary.totalFrontendClaimedAmount ?? 0),
          activeRewardPoolCount: item.rewardPoolSummary.activeRewardPoolCount ?? 0,
          expiredRewardPoolCount: item.rewardPoolSummary.expiredRewardPoolCount ?? 0,
          hasActiveBounty:
            item.rewardPoolSummary.hasActiveBounty ?? (item.rewardPoolSummary.activeRewardPoolCount ?? 0) > 0,
          nextBountyClosesAt:
            item.rewardPoolSummary.nextBountyClosesAt === null ||
            item.rewardPoolSummary.nextBountyClosesAt === undefined
              ? null
              : BigInt(item.rewardPoolSummary.nextBountyClosesAt),
          nextFeedbackClosesAt:
            item.rewardPoolSummary.nextFeedbackClosesAt === null ||
            item.rewardPoolSummary.nextFeedbackClosesAt === undefined
              ? null
              : BigInt(item.rewardPoolSummary.nextFeedbackClosesAt),
        }
      : null,
    feedbackBonusSummary: item.feedbackBonusSummary
      ? {
          totalFunded: BigInt(
            item.feedbackBonusSummary.totalFunded ?? item.feedbackBonusSummary.totalFundedAmount ?? 0,
          ),
          totalRemaining: BigInt(
            item.feedbackBonusSummary.totalRemaining ??
              item.feedbackBonusSummary.activeRemainingAmount ??
              item.feedbackBonusSummary.totalRemainingAmount ??
              0,
          ),
          totalAwarded: BigInt(
            item.feedbackBonusSummary.totalAwarded ?? item.feedbackBonusSummary.totalAwardedAmount ?? 0,
          ),
          totalVoterAwarded: BigInt(item.feedbackBonusSummary.totalVoterAwardedAmount ?? 0),
          totalFrontendAwarded: BigInt(item.feedbackBonusSummary.totalFrontendAwardedAmount ?? 0),
          totalForfeited: BigInt(item.feedbackBonusSummary.totalForfeitedAmount ?? 0),
          activePoolCount: item.feedbackBonusSummary.activePoolCount ?? 0,
          expiredPoolCount: item.feedbackBonusSummary.expiredPoolCount ?? 0,
          awardCount: item.feedbackBonusSummary.awardCount ?? 0,
          hasActiveFeedbackBonus:
            item.feedbackBonusSummary.hasActiveFeedbackBonus ?? (item.feedbackBonusSummary.activePoolCount ?? 0) > 0,
          nextFeedbackClosesAt:
            item.feedbackBonusSummary.nextFeedbackClosesAt === null ||
            item.feedbackBonusSummary.nextFeedbackClosesAt === undefined
              ? null
              : BigInt(item.feedbackBonusSummary.nextFeedbackClosesAt),
        }
      : null,
  };
}

export function mergeContentFeedMetadata(
  feed: ContentItem[],
  metadataMap: Record<string, ContentMetadataResult>,
  validationMap: Record<string, boolean | null>,
): ContentItem[] {
  return feed.map(item => {
    if (!item.url) {
      return item;
    }

    const contentMetadata = metadataMap[item.url] ?? item.contentMetadata;

    return {
      ...item,
      contentMetadata,
      isValidUrl: validationMap[item.url] ?? item.isValidUrl,
      thumbnailUrl: contentMetadata?.thumbnailUrl ?? item.thumbnailUrl,
    };
  });
}

export function filterModeratedContentItems(feed: ContentItem[]): ContentItem[] {
  return feed.filter(item => !isContentItemBlocked(item));
}

function getRewardPoolAmount(item: ContentItem) {
  return (
    (item.rewardPoolSummary?.totalAvailable ?? item.rewardPoolSummary?.totalFunded ?? 0n) +
    (item.feedbackBonusSummary?.totalRemaining ?? 0n)
  );
}

function getSearchTokens(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\s+/)
        .map(token => token.trim())
        .filter(Boolean),
    ),
  );
}

function getRpcRelevanceScore(item: ContentItem, normalizedQuery: string, queryTokens: string[]): number {
  const title = item.title.toLowerCase();
  const description = item.description.toLowerCase();
  const url = item.url.toLowerCase();
  const tags = item.tags.map(tag => tag.toLowerCase());

  let score = 0;

  if (url === normalizedQuery) {
    score += 220;
  } else if (url.includes(normalizedQuery)) {
    score += 100;
  }

  if (title === normalizedQuery) {
    score += 180;
  } else if (title.startsWith(normalizedQuery)) {
    score += 130;
  } else if (title.includes(normalizedQuery)) {
    score += 90;
  }

  if (tags.some(tag => tag === normalizedQuery)) {
    score += 120;
  } else if (tags.some(tag => tag.includes(normalizedQuery))) {
    score += 70;
  }

  if (description.includes(normalizedQuery)) {
    score += 45;
  }

  let matchedTokens = 0;
  for (const token of queryTokens) {
    let tokenMatched = false;

    if (title.includes(token)) {
      score += 24;
      tokenMatched = true;
    }

    if (tags.some(tag => tag === token)) {
      score += 20;
      tokenMatched = true;
    } else if (tags.some(tag => tag.includes(token))) {
      score += 12;
      tokenMatched = true;
    }

    if (url.includes(token)) {
      score += 14;
      tokenMatched = true;
    }

    if (description.includes(token)) {
      score += 7;
      tokenMatched = true;
    }

    if (tokenMatched) {
      matchedTokens += 1;
    }
  }

  if (queryTokens.length > 1) {
    score += matchedTokens * 6;
  }

  return score;
}

export function sortRpcFeed(feed: ContentItem[], sortBy: FeedSort, searchQuery?: string): ContentItem[] {
  const items = [...feed];

  switch (sortBy) {
    case "oldest":
      items.sort((a, b) => Number(a.id - b.id));
      break;
    case "relevance": {
      const normalizedQuery = searchQuery?.trim().toLowerCase();
      if (!normalizedQuery) {
        items.sort((a, b) => Number(b.id - a.id));
        break;
      }

      const queryTokens = getSearchTokens(normalizedQuery);
      items.sort((a, b) => {
        const scoreDifference =
          getRpcRelevanceScore(b, normalizedQuery, queryTokens) - getRpcRelevanceScore(a, normalizedQuery, queryTokens);
        if (scoreDifference !== 0) {
          return scoreDifference;
        }

        const ratingDifference = b.rating - a.rating;
        if (ratingDifference !== 0) {
          return ratingDifference;
        }

        return Number(b.id - a.id);
      });
      break;
    }
    case "highest_rewards":
      items.sort((a, b) => {
        const aAmount = getRewardPoolAmount(a);
        const bAmount = getRewardPoolAmount(b);
        if (aAmount !== bAmount) {
          return aAmount > bAmount ? -1 : 1;
        }
        return Number(b.id - a.id);
      });
      break;
    case "newest":
    case "highest_rated":
    case "lowest_rated":
    case "most_votes":
    default:
      items.sort((a, b) => Number(b.id - a.id));
      break;
  }

  return items;
}

function isLikelyUrlSearchQuery(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }

  return LIKELY_URL_SEARCH_PATTERN.test(trimmed);
}

export function isContentSearchQueryTooShort(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;

  return trimmed.length < MIN_CONTENT_SEARCH_QUERY_LENGTH && !isLikelyUrlSearchQuery(trimmed);
}

export function filterRpcFeed(feed: ContentItem[], options: UseContentFeedOptions): ContentItem[] {
  const { categoryId, contentIds, searchQuery, submitter, submitters } = options;
  if (isContentSearchQueryTooShort(searchQuery)) {
    return [];
  }

  const normalizedSearch = searchQuery?.trim().toLowerCase();
  const normalizedSubmitters = buildNormalizedAddressSet(submitters, submitter);
  const contentIdSet = contentIds ? new Set(contentIds.map(id => id.toString())) : null;

  return feed.filter(item => {
    if (categoryId !== undefined && item.categoryId !== categoryId) {
      return false;
    }

    if (contentIdSet && !contentIdSet.has(item.id.toString())) {
      return false;
    }

    if (normalizedSubmitters.size > 0 && !normalizedSubmitters.has(item.submitter.toLowerCase())) {
      return false;
    }

    if (normalizedSearch) {
      const matchesSearch =
        item.title.toLowerCase().includes(normalizedSearch) ||
        item.description.toLowerCase().includes(normalizedSearch) ||
        item.url.toLowerCase().includes(normalizedSearch) ||
        item.tags.some(tag => tag.toLowerCase().includes(normalizedSearch));
      if (!matchesSearch) {
        return false;
      }
    }

    return true;
  });
}
