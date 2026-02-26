"use client";

import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { PonderSubmitterRewardClaim, ponderApi } from "~~/services/ponder/client";

const EMPTY: PonderSubmitterRewardClaim[] = [];

/**
 * Hook that returns submitter reward claims for a given address.
 * Uses Ponder API (no RPC fallback — submitter rewards are only tracked by Ponder).
 */
export function useSubmitterRewards(address?: string) {
  const { data: result, ...rest } = usePonderQuery({
    queryKey: ["submitterRewards", address],
    ponderFn: async () => {
      if (!address) return EMPTY;
      const data = await ponderApi.getSubmitterRewards(address);
      return data.items;
    },
    rpcFn: async () => EMPTY,
    enabled: !!address,
    staleTime: 30_000,
  });

  return { rewards: result?.data ?? EMPTY, source: result?.source, ...rest };
}
