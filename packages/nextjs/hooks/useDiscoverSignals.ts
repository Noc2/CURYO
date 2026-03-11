"use client";

import { useMemo } from "react";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { type WatchedContentItem, useWatchedContent } from "~~/hooks/useWatchedContent";
import { PonderDiscoverSignalsResponse, ponderApi } from "~~/services/ponder/client";

const EMPTY_DISCOVER_SIGNALS: PonderDiscoverSignalsResponse = {
  settlingSoon: [],
  followedSubmissions: [],
  followedResolutions: [],
};

interface UseDiscoverSignalsOptions {
  autoReadWatchlist?: boolean;
  watchedItems?: WatchedContentItem[];
}

export function useDiscoverSignals(address?: string, options?: UseDiscoverSignalsOptions) {
  const isPageVisible = usePageVisibility();
  const watchlistAddress = options?.watchedItems ? undefined : address;
  const { watchedItems: hookWatchedItems, isLoading: watchedLoading } = useWatchedContent(watchlistAddress, {
    autoRead: options?.autoReadWatchlist ?? false,
  });
  const watchedItems = options?.watchedItems ?? hookWatchedItems;

  const watchedParam = useMemo(() => watchedItems.map(item => item.contentId).join(","), [watchedItems]);

  const { data, isLoading } = usePonderQuery<PonderDiscoverSignalsResponse, PonderDiscoverSignalsResponse>({
    queryKey: ["discoverSignals", address, watchedParam],
    enabled: Boolean(address),
    ponderFn: async () => {
      if (!address) return EMPTY_DISCOVER_SIGNALS;

      return ponderApi.getDiscoverSignals(address, {
        watched: watchedParam || undefined,
      });
    },
    rpcFn: async () => EMPTY_DISCOVER_SIGNALS,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
  });

  return {
    discoverSignals: data?.data ?? EMPTY_DISCOVER_SIGNALS,
    isLoading: Boolean(address) && (isLoading || (options?.watchedItems ? false : watchedLoading)),
    watchedCount: watchedItems.length,
  };
}
