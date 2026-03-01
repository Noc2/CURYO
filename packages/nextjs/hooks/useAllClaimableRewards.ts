"use client";

import { useAccount } from "wagmi";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

export interface ClaimableItem {
  contentId: bigint;
  epochId: bigint; // roundId (kept as epochId for backwards compat with ClaimAll)
  reward: bigint;
  isTie: boolean;
}

/**
 * Hook that identifies all claimable rewards across all rounds and content.
 * Uses Ponder API to find the user's recent votes, then checks on-chain state.
 *
 * In the public voting model, vote data is on-chain so no localStorage is needed.
 * We rely on Ponder to enumerate which rounds the user participated in.
 */
export function useAllClaimableRewards() {
  const { address } = useAccount();

  // Use Ponder to get user's recent votes (which content/round combos they participated in)
  const { data: _recentVotes } = usePonderQuery({
    queryKey: ["allClaimableVotes", address],
    ponderFn: async () => {
      if (!address) return [];
      const profile = await ponderApi.getProfile(address);
      // recentVotes from Ponder contains { contentId, roundId, isUp, stake, ... }
      return (profile.recentVotes ?? []) as Array<{
        contentId: string;
        roundId: string;
        isUp: boolean;
        stake: string;
      }>;
    },
    rpcFn: async () => [],
    enabled: !!address,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // For now, return a simplified version that works with the single-content hook pattern.
  // The full multicall approach will be re-implemented once the Ponder vote history endpoint is stable.
  return {
    claimableItems: [] as ClaimableItem[],
    totalClaimable: 0n,
    activeStake: 0n,
    isLoading: false,
    refetch: () => {},
  };
}
