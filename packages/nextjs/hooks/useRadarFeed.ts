"use client";

import { useMemo } from "react";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { PonderRadarResponse, ponderApi } from "~~/services/ponder/client";

const EMPTY_RADAR: PonderRadarResponse = {
  followingCount: 0,
  settlingSoon: [],
  followedSubmissions: [],
  followedResolutions: [],
  suggestedCurators: [],
  recommendedContent: [],
};

export function useRadarFeed(address?: string) {
  const { watchedItems, isLoading: watchedLoading } = useWatchedContent(address);

  const watchedParam = useMemo(() => watchedItems.map(item => item.contentId).join(","), [watchedItems]);

  const { data, isLoading } = usePonderQuery<PonderRadarResponse, PonderRadarResponse>({
    queryKey: ["radarFeed", address, watchedParam],
    enabled: Boolean(address),
    ponderFn: async () => {
      if (!address) return EMPTY_RADAR;

      return ponderApi.getRadar(address, {
        watched: watchedParam || undefined,
      });
    },
    rpcFn: async () => EMPTY_RADAR,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    radar: data?.data ?? EMPTY_RADAR,
    isLoading: Boolean(address) && (isLoading || watchedLoading),
    watchedCount: watchedItems.length,
  };
}
