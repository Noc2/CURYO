"use client";

import { useState } from "react";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { ClaimableItem } from "~~/hooks/useAllClaimableRewards";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import {
  getClaimGasErrorMessage,
  getClaimPreflightErrorMessage,
  isClaimGasShortageError,
} from "~~/lib/claimTransactionFeedback";
import { isWalletRpcOverloadedError } from "~~/lib/transactionErrors";
import { notification } from "~~/utils/scaffold-eth";

/**
 * Hook for claiming all outstanding rewards in sequence.
 */
export function useClaimAll() {
  const [isClaiming, setIsClaiming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { requireAcceptance } = useTermsAcceptance();
  const {
    canSponsorTransactions,
    freeTransactionRemaining,
    freeTransactionVerified,
    isAwaitingSponsoredWalletReconnect,
    isMissingGasBalance,
    nativeTokenSymbol,
  } = useGasBalanceStatus({
    includeExternalSendCalls: true,
  });
  const { showWalletRpcOverloadNotification } = useWalletRpcRecovery();

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

    const transactionFeedback = {
      canSponsorTransactions,
      freeTransactionRemaining,
      freeTransactionVerified,
      isAwaitingSponsoredWalletReconnect,
      isMissingGasBalance,
      nativeTokenSymbol,
    };
    const preflightError = getClaimPreflightErrorMessage(transactionFeedback);
    if (preflightError) {
      if (isAwaitingSponsoredWalletReconnect) {
        notification.warning(preflightError);
      } else {
        notification.error(preflightError);
      }
      return;
    }

    const gasErrorMessage = getClaimGasErrorMessage(transactionFeedback);
    const getTransactionErrorMessage = (error: unknown, defaultMessage: string) =>
      isClaimGasShortageError(error, transactionFeedback) ? gasErrorMessage : defaultMessage;

    setIsClaiming(true);
    setProgress({ current: 0, total: items.length });

    try {
      for (let i = 0; i < items.length; i++) {
        setProgress({ current: i + 1, total: items.length });
        const { contentId, roundId, claimType } = items[i];

        try {
          if (claimType === "refund") {
            await (writeVotingEngine as any)(
              {
                functionName: "claimCancelledRoundRefund",
                args: [contentId, roundId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else if (claimType === "submitter_reward") {
            await (writeDistributor as any)(
              {
                functionName: "claimSubmitterReward",
                args: [contentId, roundId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else {
            await (writeDistributor as any)(
              {
                functionName: "claimReward",
                args: [contentId, roundId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          }
        } catch (e: any) {
          console.error(`Claim failed for content #${contentId} round ${roundId}:`, e?.shortMessage || e?.message);
          if (isClaimGasShortageError(e, transactionFeedback)) {
            break;
          }
          if (isWalletRpcOverloadedError(e)) {
            showWalletRpcOverloadNotification();
            break;
          }
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
