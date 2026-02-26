"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Hook to read the current ParticipationPool reward rate.
 * Returns the rate as basis points, percentage, and a helper to calculate bonuses.
 */
export function useParticipationRate() {
  const {
    data: currentRateBps,
    isLoading,
    refetch,
  } = useScaffoldReadContract({
    contractName: "ParticipationPool" as any,
    functionName: "getCurrentRateBps",
    query: {
      refetchInterval: 30_000,
    },
  } as any);

  const rateBps = currentRateBps ? Number(currentRateBps) : undefined;
  const ratePercent = rateBps !== undefined ? rateBps / 100 : undefined;

  const calculateBonus = (stakeAmount: number): number | undefined => {
    if (rateBps === undefined) return undefined;
    return (stakeAmount * rateBps) / 10_000;
  };

  return {
    rateBps,
    ratePercent,
    calculateBonus,
    isLoading,
    refetch,
  };
}
