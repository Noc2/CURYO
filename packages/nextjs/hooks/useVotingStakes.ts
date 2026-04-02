"use client";

import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

interface VotingStakes {
  /** Stake in cREP locked in active rounds */
  activeStaked: number;
  /** Number of active votes */
  activeCount: number;
  /** Total voting stake (same as activeStaked in the new model) */
  totalVotingStake: number;
}

const EMPTY: VotingStakes = { activeStaked: 0, activeCount: 0, totalVotingStake: 0 };

/**
 * Hook that returns active voting stakes for a given address.
 * Uses Ponder API (on-chain indexed data, works cross-browser).
 */
export function useVotingStakes(address?: string): VotingStakes {
  const isPageVisible = usePageVisibility();
  const { data: result } = usePonderQuery({
    queryKey: ["votingStakes", address],
    ponderFn: async () => {
      if (!address) return EMPTY;
      const data = await ponderApi.getVotingStakes(address);
      const active = Number(data.activeStake) / 1e6;
      const count = data.activeCount;
      return { activeStaked: active, activeCount: count, totalVotingStake: active };
    },
    rpcFn: async () => EMPTY,
    enabled: !!address,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
  });

  return result?.data ?? EMPTY;
}
