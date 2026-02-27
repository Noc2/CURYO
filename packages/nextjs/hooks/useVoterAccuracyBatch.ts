"use client";

import { useMemo } from "react";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { PonderVoterStatsBatch, ponderApi } from "~~/services/ponder/client";

/**
 * Batch-fetch voter accuracy stats for a list of addresses.
 * Returns a map of address -> stats (with winRate).
 */
export function useVoterAccuracyBatch(addresses: string[]) {
  const uniqueAddresses = useMemo(() => {
    const seen = new Set<string>();
    return addresses
      .filter(a => a)
      .map(a => a.toLowerCase())
      .filter(a => {
        if (seen.has(a)) return false;
        seen.add(a);
        return true;
      });
  }, [addresses]);

  const addressesKey = uniqueAddresses.join(",");

  const { data, isLoading } = usePonderQuery({
    queryKey: ["voterAccuracyBatch", addressesKey],
    ponderFn: async () => {
      if (uniqueAddresses.length === 0) return {} as PonderVoterStatsBatch;
      return ponderApi.getVoterStatsBatch(uniqueAddresses);
    },
    rpcFn: async () => ({}) as PonderVoterStatsBatch,
    enabled: uniqueAddresses.length > 0,
    staleTime: 30_000,
  });

  return {
    statsMap: data?.data ?? ({} as PonderVoterStatsBatch),
    isLoading,
  };
}
