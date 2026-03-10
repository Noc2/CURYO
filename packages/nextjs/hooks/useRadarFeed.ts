"use client";

import { useMemo } from "react";
import { useFollowedCategories } from "~~/hooks/useFollowedCategories";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { useWatchedContent } from "~~/hooks/useWatchedContent";
import { PonderRadarResponse, ponderApi } from "~~/services/ponder/client";

const EMPTY_RADAR: PonderRadarResponse = {
  followingCount: 0,
  settlingSoon: [],
  followedSubmissions: [],
  followedCategoryContent: [],
  followedResolutions: [],
  suggestedCurators: [],
  recommendedContent: [],
};

export function useRadarFeed(address?: string) {
  const { watchedItems, isLoading: watchedLoading } = useWatchedContent(address);
  const { followedItems: followedCategoryItems, isLoading: followedCategoriesLoading } = useFollowedCategories(address);

  const watchedParam = useMemo(() => watchedItems.map(item => item.contentId).join(","), [watchedItems]);
  const followedCategoriesParam = useMemo(
    () => followedCategoryItems.map(item => item.categoryId).join(","),
    [followedCategoryItems],
  );

  const { data, isLoading } = usePonderQuery<PonderRadarResponse, PonderRadarResponse>({
    queryKey: ["radarFeed", address, watchedParam, followedCategoriesParam],
    enabled: Boolean(address),
    ponderFn: async () => {
      if (!address) return EMPTY_RADAR;

      return ponderApi.getRadar(address, {
        watched: watchedParam || undefined,
        categories: followedCategoriesParam || undefined,
      });
    },
    rpcFn: async () => EMPTY_RADAR,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    radar: data?.data ?? EMPTY_RADAR,
    isLoading: Boolean(address) && (isLoading || watchedLoading || followedCategoriesLoading),
    watchedCount: watchedItems.length,
    followedCategoryCount: followedCategoryItems.length,
  };
}
