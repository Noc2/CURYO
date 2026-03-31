"use client";

import { parseTags } from "~~/constants/categories";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";

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
  startTime: bigint | null;
  estimatedSettlementTime: bigint | null;
}

export interface ContentItem {
  id: bigint;
  url: string;
  title: string;
  description: string;
  tags: string[];
  submitter: string;
  contentHash: string;
  isOwnContent: boolean;
  categoryId: bigint;
  rating: number;
  createdAt: string | null;
  lastActivityAt: string | null;
  totalVotes: number;
  totalRounds: number;
  openRound: ContentOpenRoundSummary | null;
  isValidUrl: boolean | null;
  thumbnailUrl: string | null;
  contentMetadata?: ContentMetadataResult;
}

export type FeedSort = "newest" | "oldest" | "highest_rated" | "lowest_rated" | "most_votes" | "relevance";

export interface UseContentFeedOptions {
  categoryId?: bigint;
  contentIds?: bigint[];
  enabled?: boolean;
  keepPrevious?: boolean;
  limit?: number;
  offset?: number;
  searchQuery?: string;
  sortBy?: FeedSort;
  submitter?: string;
}

export function mapContentItem(
  item: {
    id: string;
    url: string;
    title: string;
    description: string;
    tags: string;
    submitter: string;
    contentHash: string;
    categoryId: string;
    rating: number;
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
      startTime: string | null;
      estimatedSettlementTime: string | null;
    } | null;
  },
  voterAddress?: string,
): ContentItem {
  return {
    id: BigInt(item.id),
    url: item.url,
    title: item.title,
    description: item.description,
    tags: parseTags(item.tags),
    submitter: item.submitter,
    contentHash: item.contentHash,
    isOwnContent: !!voterAddress && item.submitter.toLowerCase() === voterAddress.toLowerCase(),
    categoryId: BigInt(item.categoryId),
    rating: item.rating,
    createdAt: item.createdAt ?? null,
    lastActivityAt: item.lastActivityAt ?? null,
    totalVotes: item.totalVotes ?? 0,
    totalRounds: item.totalRounds ?? 0,
    openRound: item.openRound
      ? {
          roundId: BigInt(item.openRound.roundId),
          voteCount: item.openRound.voteCount,
          revealedCount: item.openRound.revealedCount,
          totalStake: BigInt(item.openRound.totalStake),
          upPool: BigInt(item.openRound.upPool),
          downPool: BigInt(item.openRound.downPool),
          upCount: item.openRound.upCount,
          downCount: item.openRound.downCount,
          startTime: item.openRound.startTime ? BigInt(item.openRound.startTime) : null,
          estimatedSettlementTime: item.openRound.estimatedSettlementTime
            ? BigInt(item.openRound.estimatedSettlementTime)
            : null,
        }
      : null,
    isValidUrl: null,
    thumbnailUrl: null,
  };
}

export function mergeContentFeedMetadata(
  feed: ContentItem[],
  metadataMap: Record<string, ContentMetadataResult>,
  validationMap: Record<string, boolean | null>,
): ContentItem[] {
  return feed.map(item => {
    const contentMetadata = metadataMap[item.url] ?? item.contentMetadata;

    return {
      ...item,
      contentMetadata,
      isValidUrl: validationMap[item.url] ?? item.isValidUrl,
      thumbnailUrl: contentMetadata?.thumbnailUrl ?? item.thumbnailUrl,
    };
  });
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
  const { categoryId, contentIds, searchQuery, submitter } = options;
  if (isContentSearchQueryTooShort(searchQuery)) {
    return [];
  }

  const normalizedSearch = searchQuery?.trim().toLowerCase();
  const normalizedSubmitter = submitter?.toLowerCase();
  const contentIdSet = contentIds ? new Set(contentIds.map(id => id.toString())) : null;

  return feed.filter(item => {
    if (categoryId !== undefined && item.categoryId !== categoryId) {
      return false;
    }

    if (contentIdSet && !contentIdSet.has(item.id.toString())) {
      return false;
    }

    if (normalizedSubmitter && item.submitter.toLowerCase() !== normalizedSubmitter) {
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
