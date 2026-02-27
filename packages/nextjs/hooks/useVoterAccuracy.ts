"use client";

import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { PonderVoterCategoryStats, PonderVoterStats, ponderApi } from "~~/services/ponder/client";

interface VoterAccuracyResult {
  stats: PonderVoterStats | null;
  categories: PonderVoterCategoryStats[];
}

const EMPTY: VoterAccuracyResult = { stats: null, categories: [] };

export function useVoterAccuracy(address: string | undefined) {
  const { data } = usePonderQuery<VoterAccuracyResult, VoterAccuracyResult>({
    queryKey: ["voterAccuracy", address],
    ponderFn: async () => {
      if (!address) return EMPTY;
      return ponderApi.getVoterAccuracy(address);
    },
    rpcFn: async () => EMPTY, // No on-chain equivalent
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return data?.data ?? EMPTY;
}
