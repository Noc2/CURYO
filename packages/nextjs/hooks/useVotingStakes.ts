"use client";

import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
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

function normalizeAddress(address?: string) {
  return address?.toLowerCase() ?? null;
}

export function getVotingStakesQueryKey(address?: string, chainId?: number) {
  return ["ponder-fallback", "votingStakes", chainId ?? null, normalizeAddress(address)] as const;
}

/**
 * Hook that returns active voting stakes for a given address.
 * Uses Ponder API (on-chain indexed data, works cross-browser).
 */
export function useVotingStakes(address?: string): VotingStakes {
  const { targetNetwork } = useTargetNetwork();
  const isPageVisible = usePageVisibility();
  const normalizedAddress = normalizeAddress(address) ?? undefined;
  const { data: result } = usePonderQuery({
    queryKey: ["votingStakes", targetNetwork.id, normalizedAddress],
    ponderFn: async () => {
      if (!normalizedAddress) return EMPTY;
      const data = await ponderApi.getVotingStakes(normalizedAddress);
      const active = Number(data.activeStake) / 1e6;
      const count = data.activeCount;
      return { activeStaked: active, activeCount: count, totalVotingStake: active };
    },
    rpcFn: async () => EMPTY,
    enabled: !!normalizedAddress,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
  });

  return result?.data ?? EMPTY;
}
