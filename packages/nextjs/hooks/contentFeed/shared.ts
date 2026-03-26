"use client";

import { parseTags } from "~~/constants/categories";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";

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

export type FeedSort = "newest" | "oldest" | "highest_rated" | "lowest_rated" | "most_votes";

export interface UseContentFeedOptions {
  categoryId?: bigint;
  contentIds?: bigint[];
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

export function sortRpcFeed(feed: ContentItem[], sortBy: FeedSort): ContentItem[] {
  const items = [...feed];

  switch (sortBy) {
    case "oldest":
      items.sort((a, b) => Number(a.id - b.id));
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

export function filterRpcFeed(feed: ContentItem[], options: UseContentFeedOptions): ContentItem[] {
  const { categoryId, contentIds, searchQuery, submitter } = options;

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
