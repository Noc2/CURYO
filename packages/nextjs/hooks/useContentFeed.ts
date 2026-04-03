"use client";

import { useMemo } from "react";
import { parseTags } from "~~/constants/categories";
import {
  type ContentItem,
  type UseContentFeedOptions,
  filterRpcFeed,
  isContentSearchQueryTooShort,
  mapContentItem,
  mergeContentFeedMetadata,
  sortRpcFeed,
} from "~~/hooks/contentFeed/shared";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { useContentFeedMetadata } from "~~/hooks/useContentFeedMetadata";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderAvailability } from "~~/hooks/usePonderAvailability";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

export type { ContentItem } from "~~/hooks/contentFeed/shared";

/**
 * Fetch the content feed.
 * Uses Ponder API when available, falls back to on-chain event scanning.
 */
export function useContentFeed(voterAddress?: string, options: UseContentFeedOptions = {}) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const ponderAvailable = usePonderAvailability(rpcFallbackEnabled);
  const rpcFallbackActive = rpcFallbackEnabled && ponderAvailable === false;
  const isPageVisible = usePageVisibility();
  const categoryId = options.categoryId;
  const contentIds = options.contentIds;
  const enabled = options.enabled ?? true;
  const keepPrevious = options.keepPrevious ?? true;
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const offset = options.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
  const searchQuery = options.searchQuery?.trim();
  const shortSearchQueryBlocked = isContentSearchQueryTooShort(searchQuery);
  const sortBy = options.sortBy ?? "newest";
  const submitter = options.submitter?.trim();

  const { data: events, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "ContentRegistry",
    eventName: "ContentSubmitted",
    watch: rpcFallbackActive && isPageVisible && enabled,
    enabled: rpcFallbackActive && isPageVisible && enabled,
  });

  const rpcFeed = useMemo(() => {
    if (!events || events.length === 0) return [];

    return events
      .map((event): ContentItem | null => {
        const args = event.args as {
          contentId?: bigint;
          submitter?: string;
          contentHash?: string;
          url?: string;
          title?: string;
          description?: string;
          tags?: string;
          categoryId?: bigint;
        };

        if (!args.contentId || !args.url || !args.title || !args.description) return null;

        const eventSubmitter = args.submitter || "";
        return {
          id: args.contentId,
          url: args.url,
          title: args.title,
          description: args.description,
          tags: parseTags(args.tags || ""),
          submitter: eventSubmitter,
          contentHash: args.contentHash || "",
          isOwnContent: !!voterAddress && eventSubmitter.toLowerCase() === voterAddress.toLowerCase(),
          categoryId: args.categoryId ?? 0n,
          rating: 50,
          createdAt: event.blockData?.timestamp
            ? new Date(Number(event.blockData.timestamp) * 1000).toISOString()
            : null,
          lastActivityAt: event.blockData?.timestamp
            ? new Date(Number(event.blockData.timestamp) * 1000).toISOString()
            : null,
          totalVotes: 0,
          totalRounds: 0,
          openRound: null,
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
  const sortedRpcFeed = useMemo(
    () => sortRpcFeed(filteredRpcFeed, sortBy, searchQuery),
    [filteredRpcFeed, searchQuery, sortBy],
  );
  const pagedRpcFeed = useMemo(() => {
    if (limit === undefined) return sortedRpcFeed.slice(offset);
    return sortedRpcFeed.slice(offset, offset + limit);
  }, [limit, offset, sortedRpcFeed]);
  const rpcTotalContent = filteredRpcFeed.length;
  const contentIdsParam = useMemo(() => contentIds?.map(id => id.toString()).join(","), [contentIds]);

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
      if (shortSearchQueryBlocked) {
        return {
          feed: [],
          totalContent: 0,
          hasMore: false,
        };
      }

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
          totalContent: response.total ?? offset + response.items.length + (response.hasMore ? 1 : 0),
          hasMore: response.hasMore,
        };
      }

      const items = await ponderApi.getAllContent(params);
      return {
        feed: items.map(item => mapContentItem(item, voterAddress)),
        totalContent: items.length,
        hasMore: false,
      };
    },
    rpcFn: async () => ({
      feed: pagedRpcFeed,
      totalContent: rpcTotalContent,
      hasMore: rpcTotalContent > offset + pagedRpcFeed.length,
    }),
    rpcEnabled: rpcFallbackEnabled,
    enabled,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
    keepPrevious,
  });

  const baseFeed = result?.source === "rpc" ? pagedRpcFeed : (result?.data?.feed ?? pagedRpcFeed);
  const totalContent = result?.source === "rpc" ? rpcTotalContent : (result?.data?.totalContent ?? rpcTotalContent);
  const hasMore =
    result?.source === "rpc"
      ? rpcTotalContent > offset + pagedRpcFeed.length
      : (result?.data?.hasMore ?? totalContent > offset + baseFeed.length);
  const isLoading = enabled && (ponderLoading || (rpcFallbackActive && eventsLoading && result?.source !== "ponder"));
  const source = result?.source ?? (rpcFallbackActive ? "rpc" : "ponder");
  const { metadataMap, validationMap, isMetadataPrefetchPending } = useContentFeedMetadata(baseFeed);

  const feed = useMemo(
    () => mergeContentFeedMetadata(baseFeed, metadataMap, validationMap),
    [baseFeed, metadataMap, validationMap],
  );

  return {
    feed,
    isLoading,
    isMetadataPrefetchPending,
    totalContent,
    hasMore,
    source,
  };
}
