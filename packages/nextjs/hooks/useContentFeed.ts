"use client";

import { useMemo } from "react";
import { parseTags } from "~~/constants/categories";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

export interface ContentItem {
  id: bigint;
  url: string;
  goal: string;
  tags: string[];
  submitter: string;
  contentHash: string;
  isOwnContent: boolean;
  categoryId: bigint;
}

type FeedSort = "newest" | "oldest" | "highest_rated" | "lowest_rated" | "most_votes";

interface UseContentFeedOptions {
  categoryId?: bigint;
  contentIds?: bigint[];
  limit?: number;
  offset?: number;
  searchQuery?: string;
  sortBy?: FeedSort;
  submitter?: string;
}

function mapContentItem(
  item: {
    id: string;
    url: string;
    goal: string;
    tags: string;
    submitter: string;
    contentHash: string;
    categoryId: string;
  },
  voterAddress?: string,
): ContentItem {
  return {
    id: BigInt(item.id),
    url: item.url,
    goal: item.goal,
    tags: parseTags(item.tags),
    submitter: item.submitter,
    contentHash: item.contentHash,
    isOwnContent: !!voterAddress && item.submitter.toLowerCase() === voterAddress.toLowerCase(),
    categoryId: BigInt(item.categoryId),
  };
}

function sortRpcFeed(feed: ContentItem[], sortBy: FeedSort): ContentItem[] {
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

function filterRpcFeed(feed: ContentItem[], options: UseContentFeedOptions): ContentItem[] {
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
        item.goal.toLowerCase().includes(normalizedSearch) ||
        item.url.toLowerCase().includes(normalizedSearch) ||
        item.tags.some(tag => tag.toLowerCase().includes(normalizedSearch));
      if (!matchesSearch) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Fetch the content feed.
 * Uses Ponder API when available, falls back to on-chain event scanning.
 */
export function useContentFeed(voterAddress?: string, options: UseContentFeedOptions = {}) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const categoryId = options.categoryId;
  const contentIds = options.contentIds;
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const offset = options.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
  const searchQuery = options.searchQuery?.trim();
  const sortBy = options.sortBy ?? "newest";
  const submitter = options.submitter?.trim();

  // --- RPC fallback: get content submitted events ---
  const { data: events, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "ContentRegistry",
    eventName: "ContentSubmitted",
    watch: rpcFallbackEnabled,
    enabled: rpcFallbackEnabled,
  });

  // Transform RPC events to ContentItem[]
  const rpcFeed = useMemo(() => {
    if (!events || events.length === 0) return [];

    return events
      .map(event => {
        const args = event.args as {
          contentId?: bigint;
          submitter?: string;
          contentHash?: string;
          url?: string;
          goal?: string;
          tags?: string;
          categoryId?: bigint;
        };

        if (!args.contentId || !args.url || !args.goal) return null;

        const submitter = args.submitter || "";
        return {
          id: args.contentId,
          url: args.url,
          goal: args.goal,
          tags: parseTags(args.tags || ""),
          submitter,
          contentHash: args.contentHash || "",
          isOwnContent: !!voterAddress && submitter.toLowerCase() === voterAddress.toLowerCase(),
          categoryId: args.categoryId ?? 0n,
        } satisfies ContentItem;
      })
      .filter((item): item is ContentItem => item !== null);
  }, [events, voterAddress]);

  const filteredRpcFeed = useMemo(
    () =>
      filterRpcFeed(rpcFeed, {
        categoryId,
        contentIds,
        searchQuery,
        submitter,
      }),
    [categoryId, contentIds, rpcFeed, searchQuery, submitter],
  );
  const sortedRpcFeed = useMemo(() => sortRpcFeed(filteredRpcFeed, sortBy), [filteredRpcFeed, sortBy]);
  const pagedRpcFeed = useMemo(() => {
    if (limit === undefined) return sortedRpcFeed.slice(offset);
    return sortedRpcFeed.slice(offset, offset + limit);
  }, [sortedRpcFeed, offset, limit]);
  const rpcTotalContent = filteredRpcFeed.length;
  const contentIdsParam = useMemo(() => contentIds?.map(id => id.toString()).join(","), [contentIds]);

  // --- Ponder-first with RPC fallback ---
  const { data: result, isLoading: ponderLoading } = usePonderQuery({
    queryKey: [
      "contentFeed",
      voterAddress,
      sortBy,
      limit ?? "all",
      offset,
      categoryId?.toString() ?? "all",
      submitter ?? "all",
      searchQuery ?? "",
      contentIdsParam ?? "",
    ],
    ponderFn: async () => {
      const params = {
        categoryId: categoryId?.toString(),
        contentIds: contentIdsParam,
        search: searchQuery || undefined,
        sortBy,
        status: "all",
        submitter: submitter || undefined,
      };

      if (limit !== undefined) {
        const response = await ponderApi.getContentWindow({
          ...params,
          limit: String(limit),
          offset: String(offset),
        });
        return {
          feed: response.items.map(item => mapContentItem(item, voterAddress)),
          totalContent: response.total,
        };
      }

      const items = await ponderApi.getAllContent(params);
      return {
        feed: items.map(item => mapContentItem(item, voterAddress)),
        totalContent: items.length,
      };
    },
    rpcFn: async () => ({
      feed: pagedRpcFeed,
      totalContent: rpcTotalContent,
    }),
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const feed = result?.data?.feed ?? pagedRpcFeed;
  const totalContent = result?.data?.totalContent ?? rpcTotalContent;

  return {
    feed,
    isLoading: ponderLoading && eventsLoading,
    totalContent,
    hasMore: totalContent > offset + feed.length,
  };
}
