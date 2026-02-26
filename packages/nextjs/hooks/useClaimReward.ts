"use client";

import { useState } from "react";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

/**
 * Hook for claiming rewards from settled rounds and tie refunds.
 */
export function useClaimReward() {
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { requireAcceptance } = useTermsAcceptance();

  const { writeContractAsync: writeDistributor } = useScaffoldWriteContract({
    contractName: "RoundRewardDistributor",
  } as any);

  const { writeContractAsync: writeVotingEngine } = useScaffoldWriteContract({
    contractName: "RoundVotingEngine",
  } as any);

  const claimReward = async (contentId: bigint, roundId: bigint) => {
    // Require terms acceptance before claiming
    const accepted = await requireAcceptance("claim");
    if (!accepted) return false;

    setIsClaiming(true);
    setError(null);

    try {
      await (writeDistributor as any)({
        functionName: "claimReward",
        args: [contentId, roundId],
      });
      return true;
    } catch (e: any) {
      console.error("Claim reward failed:", e);
      setError(e?.shortMessage || e?.message || "Failed to claim reward");
      return false;
    } finally {
      setIsClaiming(false);
    }
  };

  const claimSubmitterReward = async (contentId: bigint, roundId: bigint) => {
    // Require terms acceptance before claiming
    const accepted = await requireAcceptance("claim");
    if (!accepted) return false;

    setIsClaiming(true);
    setError(null);

    try {
      await (writeDistributor as any)({
        functionName: "claimSubmitterReward",
        args: [contentId, roundId],
      });
      return true;
    } catch (e: any) {
      console.error("Claim submitter reward failed:", e);
      setError(e?.shortMessage || e?.message || "Failed to claim submitter reward");
      return false;
    } finally {
      setIsClaiming(false);
    }
  };

  const claimTieRefund = async (contentId: bigint, roundId: bigint) => {
    const accepted = await requireAcceptance("claim");
    if (!accepted) return false;

    setIsClaiming(true);
    setError(null);

    try {
      await (writeVotingEngine as any)({
        functionName: "claimCancelledRoundRefund",
        args: [contentId, roundId],
      });
      return true;
    } catch (e: any) {
      console.error("Claim tie refund failed:", e);
      setError(e?.shortMessage || e?.message || "Failed to claim tie refund");
      return false;
    } finally {
      setIsClaiming(false);
    }
  };

  return {
    claimReward,
    claimSubmitterReward,
    claimTieRefund,
    isClaiming,
    error,
  };
}
