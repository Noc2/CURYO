"use client";

import { useState } from "react";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import {
  getClaimGasErrorMessage,
  getClaimPreflightErrorMessage,
  isClaimGasShortageError,
} from "~~/lib/claimTransactionFeedback";
import { isWalletRpcOverloadedError } from "~~/lib/transactionErrors";
import { notification } from "~~/utils/scaffold-eth";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

/**
 * Hook for claiming settled-round payouts and round refunds.
 */
export function useClaimReward() {
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { requireAcceptance } = useTermsAcceptance();
  const { targetNetwork } = useTargetNetwork();
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

  const transactionFeedback = {
    canSponsorTransactions,
    freeTransactionRemaining,
    freeTransactionVerified,
    isAwaitingSponsoredWalletReconnect,
    isMissingGasBalance,
    nativeTokenSymbol,
  };
  const gasErrorMessage = getClaimGasErrorMessage(transactionFeedback);
  const getTransactionErrorMessage = (claimError: unknown, defaultMessage: string) =>
    isClaimGasShortageError(claimError, transactionFeedback) ? gasErrorMessage : defaultMessage;

  const claimReward = async (contentId: bigint, roundId: bigint) => {
    // Require terms acceptance before claiming
    const accepted = await requireAcceptance("claim");
    if (!accepted) return false;

    const preflightError = getClaimPreflightErrorMessage(transactionFeedback);
    if (preflightError) {
      setError(preflightError);
      if (isAwaitingSponsoredWalletReconnect) {
        notification.warning(preflightError);
      } else {
        notification.error(preflightError);
      }
      return false;
    }

    setIsClaiming(true);
    setError(null);

    try {
      await (writeDistributor as any)(
        {
          functionName: "claimReward",
          args: [contentId, roundId],
        },
        { getErrorMessage: getTransactionErrorMessage },
      );
      return true;
    } catch (e: any) {
      console.error("Claim reward failed:", e);
      if (isClaimGasShortageError(e, transactionFeedback)) {
        setError(gasErrorMessage);
      } else if (isWalletRpcOverloadedError(e)) {
        showWalletRpcOverloadNotification();
        setError("Wallet RPC is overloaded. Retry soon or refresh RPC.");
      } else {
        setError(
          getParsedErrorWithAllAbis(e, targetNetwork.id as any) ||
            e?.shortMessage ||
            e?.message ||
            "Failed to claim reward",
        );
      }
      return false;
    } finally {
      setIsClaiming(false);
    }
  };

  const claimSubmitterReward = async (contentId: bigint, roundId: bigint) => {
    // Require terms acceptance before claiming
    const accepted = await requireAcceptance("claim");
    if (!accepted) return false;

    const preflightError = getClaimPreflightErrorMessage(transactionFeedback);
    if (preflightError) {
      setError(preflightError);
      if (isAwaitingSponsoredWalletReconnect) {
        notification.warning(preflightError);
      } else {
        notification.error(preflightError);
      }
      return false;
    }

    setIsClaiming(true);
    setError(null);

    try {
      await (writeDistributor as any)(
        {
          functionName: "claimSubmitterReward",
          args: [contentId, roundId],
        },
        { getErrorMessage: getTransactionErrorMessage },
      );
      return true;
    } catch (e: any) {
      console.error("Claim submitter reward failed:", e);
      if (isClaimGasShortageError(e, transactionFeedback)) {
        setError(gasErrorMessage);
      } else if (isWalletRpcOverloadedError(e)) {
        showWalletRpcOverloadNotification();
        setError("Wallet RPC is overloaded. Retry soon or refresh RPC.");
      } else {
        setError(
          getParsedErrorWithAllAbis(e, targetNetwork.id as any) ||
            e?.shortMessage ||
            e?.message ||
            "Failed to claim submitter reward",
        );
      }
      return false;
    } finally {
      setIsClaiming(false);
    }
  };

  const claimTieRefund = async (contentId: bigint, roundId: bigint) => {
    const accepted = await requireAcceptance("claim");
    if (!accepted) return false;

    const preflightError = getClaimPreflightErrorMessage(transactionFeedback);
    if (preflightError) {
      setError(preflightError);
      if (isAwaitingSponsoredWalletReconnect) {
        notification.warning(preflightError);
      } else {
        notification.error(preflightError);
      }
      return false;
    }

    setIsClaiming(true);
    setError(null);

    try {
      await (writeVotingEngine as any)(
        {
          functionName: "claimCancelledRoundRefund",
          args: [contentId, roundId],
        },
        { getErrorMessage: getTransactionErrorMessage },
      );
      return true;
    } catch (e: any) {
      console.error("Claim tie refund failed:", e);
      if (isClaimGasShortageError(e, transactionFeedback)) {
        setError(gasErrorMessage);
      } else if (isWalletRpcOverloadedError(e)) {
        showWalletRpcOverloadNotification();
        setError("Wallet RPC is overloaded. Retry soon or refresh RPC.");
      } else {
        setError(
          getParsedErrorWithAllAbis(e, targetNetwork.id as any) ||
            e?.shortMessage ||
            e?.message ||
            "Failed to claim tie refund",
        );
      }
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
