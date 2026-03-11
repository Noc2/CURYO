"use client";

import { useMemo } from "react";
import { parseTags } from "~~/constants/categories";
import {
  type ContentItem,
  type UseContentFeedOptions,
  filterRpcFeed,
  mapContentItem,
  sortRpcFeed,
} from "~~/hooks/contentFeed/shared";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderAvailability } from "~~/hooks/usePonderAvailability";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

export function useContentFeedQuery(voterAddress?: string, options: UseContentFeedOptions = {}) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const ponderAvailable = usePonderAvailability(rpcFallbackEnabled);
  const rpcFallbackActive = rpcFallbackEnabled && ponderAvailable === false;
  const isPageVisible = usePageVisibility();
  const categoryId = options.categoryId;
  const contentIds = options.contentIds;
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const offset = options.offset && options.offset > 0 ? Math.floor(options.offset) : 0;
  const searchQuery = options.searchQuery?.trim();
  const sortBy = options.sortBy ?? "newest";
  const submitter = options.submitter?.trim();

  const { data: events, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "ContentRegistry",
    eventName: "ContentSubmitted",
    watch: rpcFallbackActive && isPageVisible,
    enabled: rpcFallbackActive && isPageVisible,
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
          goal?: string;
          tags?: string;
          categoryId?: bigint;
        };

        if (!args.contentId || !args.url || !args.goal) return null;

        const eventSubmitter = args.submitter || "";
        return {
          id: args.contentId,
          url: args.url,
          goal: args.goal,
          tags: parseTags(args.tags || ""),
          submitter: eventSubmitter,
          contentHash: args.contentHash || "",
          isOwnContent: !!voterAddress && eventSubmitter.toLowerCase() === voterAddress.toLowerCase(),
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
    refetchInterval: isPageVisible ? 30_000 : false,
  });

  const feed = result?.source === "rpc" ? pagedRpcFeed : (result?.data?.feed ?? pagedRpcFeed);
  const totalContent = result?.source === "rpc" ? rpcTotalContent : (result?.data?.totalContent ?? rpcTotalContent);
  const isLoading = ponderLoading || (rpcFallbackActive && eventsLoading && result?.source !== "ponder");

  return {
    feed,
    isLoading,
    totalContent,
    offset,
  };
}
