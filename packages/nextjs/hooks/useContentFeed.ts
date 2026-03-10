"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
  isValidUrl: boolean | null;
  thumbnailUrl: string | null;
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
    isValidUrl: null,
    thumbnailUrl: null,
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
      .map((event): ContentItem | null => {
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
          isValidUrl: null,
          thumbnailUrl: null,
        };
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

  const baseFeed = result?.source === "rpc" ? pagedRpcFeed : (result?.data?.feed ?? pagedRpcFeed);
  const totalContent = result?.source === "rpc" ? rpcTotalContent : (result?.data?.totalContent ?? rpcTotalContent);
  const isLoading = ponderLoading || (rpcFallbackEnabled && eventsLoading && result?.source !== "ponder");
  const feedUrls = useMemo(() => [...new Set(baseFeed.map(item => item.url))], [baseFeed]);
  const feedUrlsKey = useMemo(() => feedUrls.join(","), [feedUrls]);

  const { data: metadataResult } = useQuery({
    queryKey: ["contentFeedMetadata", feedUrlsKey],
    enabled: feedUrls.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const thumbnailMap: Record<string, string | null> = {};
      const validationMap: Record<string, boolean | null> = {};

      const thumbnailBatchSize = 40;
      for (let i = 0; i < feedUrls.length; i += thumbnailBatchSize) {
        const batch = feedUrls.slice(i, i + thumbnailBatchSize);
        try {
          const response = await fetch("/api/thumbnails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: batch }),
          });
          if (!response.ok) continue;
          const data = (await response.json()) as {
            items?: Record<string, { thumbnailUrl?: string | null; imageUrl?: string | null }>;
          };
          for (const [url, item] of Object.entries(data.items ?? {})) {
            thumbnailMap[url] = item.thumbnailUrl ?? item.imageUrl ?? null;
          }
        } catch {
          // Metadata is optional; keep rendering even when enrichment fails.
        }
      }

      const validationBatchSize = 10;
      for (let i = 0; i < feedUrls.length; i += validationBatchSize) {
        const batch = feedUrls.slice(i, i + validationBatchSize);
        try {
          const response = await fetch("/api/url-validation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: batch }),
          });
          if (!response.ok) continue;
          const data = (await response.json()) as { results?: Record<string, { isValid: boolean }> };
          for (const [url, result] of Object.entries(data.results ?? {})) {
            validationMap[url] = result.isValid;
          }
        } catch {
          // Treat failures as unknown validity and keep rendering.
        }
      }

      return { thumbnailMap, validationMap };
    },
  });

  const feed = useMemo(() => {
    const thumbnailMap = metadataResult?.thumbnailMap ?? {};
    const validationMap = metadataResult?.validationMap ?? {};

    return baseFeed.map(item => ({
      ...item,
      isValidUrl: validationMap[item.url] ?? item.isValidUrl,
      thumbnailUrl: thumbnailMap[item.url] ?? item.thumbnailUrl,
    }));
  }, [baseFeed, metadataResult]);

  return {
    feed,
    isLoading,
    totalContent,
    hasMore: totalContent > offset + feed.length,
  };
}
