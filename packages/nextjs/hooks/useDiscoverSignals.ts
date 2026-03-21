"use client";

import { useMemo } from "react";
import { type FollowedProfileItem, useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
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
  autoReadFollows?: boolean;
  watchedItems?: WatchedContentItem[];
  followedItems?: FollowedProfileItem[];
}

export function useDiscoverSignals(address?: string, options?: UseDiscoverSignalsOptions) {
  const isPageVisible = usePageVisibility();
  const watchlistAddress = options?.watchedItems ? undefined : address;
  const followsAddress = options?.followedItems ? undefined : address;
  const { watchedItems: hookWatchedItems, isLoading: watchedLoading } = useWatchedContent(watchlistAddress, {
    autoRead: options?.autoReadWatchlist ?? false,
  });
  const { followedItems: hookFollowedItems, isLoading: followedLoading } = useFollowedProfiles(followsAddress, {
    autoRead: options?.autoReadFollows ?? false,
  });
  const watchedItems = options?.watchedItems ?? hookWatchedItems;
  const followedItems = options?.followedItems ?? hookFollowedItems;

  const watchedParam = useMemo(() => watchedItems.map(item => item.contentId).join(","), [watchedItems]);
  const followedParam = useMemo(
    () => followedItems.map(item => item.walletAddress.toLowerCase()).join(","),
    [followedItems],
  );

  const { data, isLoading } = usePonderQuery<PonderDiscoverSignalsResponse, PonderDiscoverSignalsResponse>({
    queryKey: ["discoverSignals", address, watchedParam, followedParam],
    enabled: Boolean(address),
    ponderFn: async () => {
      if (!address) return EMPTY_DISCOVER_SIGNALS;

      return ponderApi.getDiscoverSignals(address, {
        watched: watchedParam || undefined,
        followed: followedParam,
      });
    },
    rpcFn: async () => EMPTY_DISCOVER_SIGNALS,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
    keepPrevious: true,
  });

  return {
    discoverSignals: data?.data ?? EMPTY_DISCOVER_SIGNALS,
    isLoading:
      Boolean(address) &&
      (isLoading ||
        (options?.watchedItems ? false : watchedLoading) ||
        (options?.followedItems ? false : followedLoading)),
    watchedCount: watchedItems.length,
  };
}
