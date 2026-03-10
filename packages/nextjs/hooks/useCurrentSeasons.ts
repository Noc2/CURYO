"use client";

import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { PonderCurrentSeasonsResponse, ponderApi } from "~~/services/ponder/client";

const EMPTY_SEASONS: PonderCurrentSeasonsResponse = {
  startsAt: "0",
  endsAt: "0",
  global: {
    key: "global",
    label: "Global Weekly Season",
    standings: [],
    me: null,
  },
  category: null,
};

export function useCurrentSeasons(address?: string) {
  const { data, isLoading } = usePonderQuery<PonderCurrentSeasonsResponse, PonderCurrentSeasonsResponse>({
    queryKey: ["currentSeasons", address],
    ponderFn: async () => ponderApi.getCurrentSeasons(address),
    rpcFn: async () => EMPTY_SEASONS,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return {
    seasons: data?.data ?? EMPTY_SEASONS,
    isLoading,
  };
}
