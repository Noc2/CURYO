"use client";

import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { PonderFeaturedTodayItem, ponderApi } from "~~/services/ponder/client";

const EMPTY_FEATURED: PonderFeaturedTodayItem[] = [];

export function useFeaturedToday(limit = 6) {
  const { data, isLoading } = usePonderQuery<
    { items: PonderFeaturedTodayItem[] },
    { items: PonderFeaturedTodayItem[] }
  >({
    queryKey: ["featuredToday", String(limit)],
    ponderFn: async () => ponderApi.getFeaturedToday(String(limit)),
    rpcFn: async () => ({ items: EMPTY_FEATURED }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    items: data?.data.items ?? EMPTY_FEATURED,
    isLoading,
  };
}
