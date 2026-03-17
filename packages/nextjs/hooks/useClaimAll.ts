"use client";

import { useState } from "react";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { ClaimableItem } from "~~/hooks/useAllClaimableRewards";

/**
 * Hook for claiming all outstanding rewards in sequence.
 */
export function useClaimAll() {
  const [isClaiming, setIsClaiming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { requireAcceptance } = useTermsAcceptance();

  const { writeContractAsync: writeDistributor } = useScaffoldWriteContract({
    contractName: "RoundRewardDistributor",
  } as any);

  const { writeContractAsync: writeVotingEngine } = useScaffoldWriteContract({
    contractName: "RoundVotingEngine",
  } as any);

  const claimAll = async (items: ClaimableItem[], onComplete?: () => void) => {
    if (items.length === 0) return;

    const accepted = await requireAcceptance("claim");
    if (!accepted) return;

    setIsClaiming(true);
    setProgress({ current: 0, total: items.length });

    try {
      for (let i = 0; i < items.length; i++) {
        setProgress({ current: i + 1, total: items.length });
        const { contentId, roundId, claimType } = items[i];

        try {
          if (claimType === "refund") {
            await (writeVotingEngine as any)({
              functionName: "claimCancelledRoundRefund",
              args: [contentId, roundId],
            });
          } else {
            await (writeDistributor as any)({
              functionName: "claimReward",
              args: [contentId, roundId],
            });
          }
        } catch (e: any) {
          console.error(`Claim failed for content #${contentId} round ${roundId}:`, e?.shortMessage || e?.message);
        }
      }
      onComplete?.();
    } finally {
      setIsClaiming(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  return { claimAll, isClaiming, progress };
}
