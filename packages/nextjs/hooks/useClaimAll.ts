"use client";

import { useState } from "react";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { type ClaimableRewardItem } from "~~/hooks/claimableRewards";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
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

  const { writeContractAsync: writeContentRegistry } = useScaffoldWriteContract({
    contractName: "ContentRegistry",
  } as any);

  const claimAll = async (items: ClaimableRewardItem[], onComplete?: () => void) => {
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
        const item = items[i];

        try {
          if (item.claimType === "refund") {
            await (writeVotingEngine as any)(
              {
                functionName: "claimCancelledRoundRefund",
                args: [item.contentId, item.roundId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else if (item.claimType === "submitter_reward") {
            await (writeDistributor as any)(
              {
                functionName: "claimSubmitterReward",
                args: [item.contentId, item.roundId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else if (item.claimType === "submitter_participation_reward") {
            await (writeContentRegistry as any)(
              {
                functionName: "claimSubmitterParticipationReward",
                args: [item.contentId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else {
            await (writeDistributor as any)(
              {
                functionName: "claimReward",
                args: [item.contentId, item.roundId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          }
        } catch (e: any) {
          const claimLabel =
            item.claimType === "submitter_participation_reward"
              ? `submitter participation reward for content #${item.contentId}`
              : `content #${item.contentId} round ${item.roundId}`;
          console.error(`Claim failed for ${claimLabel}:`, e?.shortMessage || e?.message);
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
