"use client";

import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

export interface VotingStakes {
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
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return result?.data ?? EMPTY;
}
