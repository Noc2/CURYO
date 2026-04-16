"use client";

import { parseTags } from "~~/constants/categories";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
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
  estimatedSettlementTime: bigint | null;
}

export interface ContentItem {
  id: bigint;
  url: string;
  question?: string;
  title: string;
  description: string;
  tags: string[];
  submitter: string;
  contentHash: string;
  isOwnContent: boolean;
  categoryId: bigint;
  rating: number;
  ratingBps?: bigint;
  conservativeRatingBps?: bigint;
  createdAt: string | null;
  lastActivityAt: string | null;
  totalVotes: number;
  totalRounds: number;
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
  } | null;
}

export type FeedSort = "newest" | "oldest" | "highest_rated" | "lowest_rated" | "most_votes" | "relevance";

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

export function mapContentItem(
  item: {
    id: string;
    url?: string | null;
    question?: string | null;
    title: string;
    description: string;
    tags: string;
    submitter: string;
    contentHash: string;
    categoryId: string;
    rating: number;
    ratingBps?: number;
    conservativeRatingBps?: number;
    createdAt?: string | null;
    lastActivityAt?: string | null;
    totalVotes?: number;
    totalRounds?: number;
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
    } | null;
  },
  voterAddress?: string,
  ownSubmitterAddresses?: readonly string[],
): ContentItem {
  const ownSubmitterAddressSet = buildNormalizedAddressSet(ownSubmitterAddresses, voterAddress);
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

  return {
    id: BigInt(item.id),
    url: item.url ?? "",
    question: item.question?.trim() || item.title,
    title: item.title,
    description: item.description,
    tags: parseTags(item.tags),
    submitter: item.submitter,
    contentHash: item.contentHash,
    isOwnContent: ownSubmitterAddressSet.has(item.submitter.toLowerCase()),
    categoryId: BigInt(item.categoryId),
    rating: displayedRating,
    ratingBps,
    conservativeRatingBps,
    createdAt: item.createdAt ?? null,
    lastActivityAt: item.lastActivityAt ?? null,
    totalVotes: item.totalVotes ?? 0,
    totalRounds: item.totalRounds ?? 0,
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
