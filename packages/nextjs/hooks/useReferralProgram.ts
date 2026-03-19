"use client";

import { useMemo } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

export function formatReferralAmount(amount: bigint | undefined) {
  if (!amount) return "0";
  return (Number(amount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function useReferralProgram(address?: string) {
  const { hasVoterId } = useVoterIdNFT(address);

  const { data: referralAmounts } = useScaffoldReadContract({
    contractName: "HumanFaucet" as any,
    functionName: "getCurrentReferralAmounts",
  } as any);

  const { data: referralStats } = useScaffoldReadContract({
    contractName: "HumanFaucet" as any,
    functionName: "getReferralStats",
    args: [address],
    query: {
      enabled: !!address,
    },
  } as any);

  const claimantBonus = referralAmounts?.[0] ?? 0n;
  const referralReward = referralAmounts?.[1] ?? 0n;
  const referralCount = referralStats?.[0] ?? 0n;
  const totalEarned = referralStats?.[1] ?? 0n;

  const referralLink = useMemo(() => {
    if (typeof window === "undefined" || !address) {
      return "";
    }

    return `${window.location.origin}/governance?ref=${address}`;
  }, [address]);

  return {
    claimantBonus,
    hasVoterId,
    referralCount,
    referralLink,
    referralReward,
    totalEarned,
  };
}
