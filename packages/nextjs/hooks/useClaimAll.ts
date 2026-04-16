"use client";

import { useState } from "react";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { type ClaimableRewardItem, sortClaimableRewardItems } from "~~/hooks/claimableRewards";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import {
  getClaimGasErrorMessage,
  getClaimPreflightErrorMessage,
  isClaimGasShortageError,
} from "~~/lib/claimTransactionFeedback";
import {
  QUESTION_REWARD_POOL_ESCROW_ABI,
  getConfiguredQuestionRewardPoolEscrowAddress,
} from "~~/lib/questionRewardPools";
import { isWalletRpcOverloadedError } from "~~/lib/transactionErrors";
import { notification } from "~~/utils/scaffold-eth";

/**
 * Hook for claiming all outstanding rewards in sequence.
 */
export function useClaimAll() {
  const { chain } = useAccount();
  const wagmiConfig = useConfig();
  const { writeContractAsync: writeDirectContractAsync } = useWriteContract();
  const [isClaiming, setIsClaiming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { requireAcceptance } = useTermsAcceptance();
  const {
    canShowFreeTransactionAllowance,
    canSponsorTransactions,
    freeTransactionRemaining,
    freeTransactionVerified,
    isAwaitingFreeTransactionAllowance,
    isAwaitingSelfFundedWalletReconnect,
    isAwaitingSponsoredWalletReconnect,
    isMissingGasBalance,
    nativeBalanceValue,
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
  const { writeContractAsync: writeFrontendRegistry } = useScaffoldWriteContract({
    contractName: "FrontendRegistry",
  } as any);

  const claimAll = async (items: ClaimableRewardItem[], onComplete?: () => void) => {
    if (items.length === 0) return;

    const accepted = await requireAcceptance("claim");
    if (!accepted) return;

    const transactionFeedback = {
      canShowFreeTransactionAllowance,
      canSponsorTransactions,
      freeTransactionRemaining,
      freeTransactionVerified,
      hasNativeGasBalance: nativeBalanceValue > 0n,
      isAwaitingFreeTransactionAllowance,
      isAwaitingSelfFundedWalletReconnect,
      isAwaitingSponsoredWalletReconnect,
      isMissingGasBalance,
      nativeTokenSymbol,
    };
    const preflightError = getClaimPreflightErrorMessage(transactionFeedback);
    if (preflightError) {
      if (
        isAwaitingFreeTransactionAllowance ||
        isAwaitingSelfFundedWalletReconnect ||
        isAwaitingSponsoredWalletReconnect
      ) {
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
    const orderedItems = sortClaimableRewardItems(items);
    let creditedFrontendRoundCount = 0;
    setProgress({ current: 0, total: orderedItems.length });

    try {
      for (let i = 0; i < orderedItems.length; i++) {
        setProgress({ current: i + 1, total: orderedItems.length });
        const item = orderedItems[i];

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
          } else if (item.claimType === "participation_reward") {
            await (writeDistributor as any)(
              {
                functionName: "claimParticipationReward",
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
          } else if (item.claimType === "frontend_round_fee") {
            await (writeDistributor as any)(
              {
                functionName: "claimFrontendFee",
                args: [item.contentId, item.roundId, item.frontend],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
            creditedFrontendRoundCount += 1;
          } else if (item.claimType === "frontend_registry_fee") {
            if (item.reward <= 0n && creditedFrontendRoundCount === 0) {
              continue;
            }

            await (writeFrontendRegistry as any)(
              {
                functionName: "claimFees",
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else if (item.claimType === "question_reward") {
            const escrowAddress = getConfiguredQuestionRewardPoolEscrowAddress(
              chain?.id ?? wagmiConfig.chains[0]?.id ?? 0,
            );
            if (!escrowAddress) {
              notification.error("Question Reward Pools are not deployed on this network yet.");
              continue;
            }

            const hash = await writeDirectContractAsync({
              address: escrowAddress,
              abi: QUESTION_REWARD_POOL_ESCROW_ABI,
              functionName: "claimQuestionReward",
              args: [item.rewardPoolId, item.roundId],
            });
            await waitForTransactionReceipt(wagmiConfig, { hash });
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
            item.claimType === "participation_reward"
              ? `bootstrap reward for content #${item.contentId} round ${item.roundId}`
              : item.claimType === "submitter_participation_reward"
                ? `submitter bootstrap reward for content #${item.contentId}`
                : item.claimType === "question_reward"
                  ? `question reward for content #${item.contentId} round ${item.roundId}`
                  : item.claimType === "frontend_registry_fee"
                    ? `frontend registry fees for ${item.frontend}`
                    : item.claimType === "frontend_round_fee"
                      ? `frontend round fee for content #${item.contentId} round ${item.roundId}`
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

  return {
    claimAll,
    isClaiming,
    isPreparingClaim:
      isAwaitingFreeTransactionAllowance || isAwaitingSelfFundedWalletReconnect || isAwaitingSponsoredWalletReconnect,
    progress,
  };
}
