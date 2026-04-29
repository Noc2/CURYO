"use client";

import { useState } from "react";
import { type Abi } from "viem";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { type ClaimableRewardItem, sortClaimableRewardItems } from "~~/hooks/claimableRewards";
import { useDeployedContractInfo, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
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
type SponsoredClaimCall = {
  abi: Abi;
  address: `0x${string}`;
  functionName: string;
  args?: readonly unknown[];
};

function getClaimableRewardLabel(item: ClaimableRewardItem) {
  switch (item.claimType) {
    case "participation_reward":
      return `bootstrap reward for content #${item.contentId} round ${item.roundId}`;
    case "question_reward":
      return `bounty for content #${item.contentId} round ${item.roundId}`;
    case "question_bundle_reward":
      return `bundle bounty #${item.bundleId} round set ${item.roundSetIndex + 1n}`;
    case "frontend_registry_fee":
      return `frontend registry fees for ${item.frontend}`;
    case "frontend_round_fee":
      return `frontend round fee for content #${item.contentId} round ${item.roundId}`;
    case "refund":
    case "reward":
      return `content #${item.contentId} round ${item.roundId}`;
  }
}

export function useClaimAll() {
  const [isClaiming, setIsClaiming] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const { requireAcceptance } = useTermsAcceptance();
  const { targetNetwork } = useTargetNetwork();
  const questionRewardPoolEscrowAddress = getConfiguredQuestionRewardPoolEscrowAddress(targetNetwork.id);
  const { canUseSponsoredSubmitCalls, executeSponsoredCalls, isAwaitingSponsoredSubmitCalls } =
    useThirdwebSponsoredSubmitCalls();
  const { data: distributorInfo } = useDeployedContractInfo({ contractName: "RoundRewardDistributor" });
  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });
  const { data: frontendRegistryInfo } = useDeployedContractInfo({ contractName: "FrontendRegistry" });
  const { data: questionRewardPoolEscrowInfo } = useDeployedContractInfo({
    contractName: "QuestionRewardPoolEscrow" as any,
  });
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

  const { writeContractAsync: writeFrontendRegistry } = useScaffoldWriteContract({
    contractName: "FrontendRegistry",
  } as any);
  const { writeContractAsync: writeQuestionRewardPoolEscrow } = useScaffoldWriteContract({
    contractName: "QuestionRewardPoolEscrow",
  } as any);

  const getSponsoredClaimCall = (item: ClaimableRewardItem): SponsoredClaimCall => {
    if (item.claimType === "refund") {
      if (!votingEngineInfo) throw new Error("Round voting engine is unavailable right now.");
      return {
        abi: votingEngineInfo.abi as Abi,
        address: votingEngineInfo.address as `0x${string}`,
        args: [item.contentId, item.roundId],
        functionName: "claimCancelledRoundRefund",
      };
    }

    if (item.claimType === "frontend_registry_fee") {
      if (!frontendRegistryInfo) throw new Error("Frontend registry is unavailable right now.");
      return {
        abi: frontendRegistryInfo.abi as Abi,
        address: frontendRegistryInfo.address as `0x${string}`,
        functionName: "claimFees",
      };
    }

    if (item.claimType === "question_reward") {
      if (!questionRewardPoolEscrowInfo) throw new Error("Question reward escrow is unavailable right now.");
      return {
        abi: questionRewardPoolEscrowInfo.abi as Abi,
        address: questionRewardPoolEscrowInfo.address as `0x${string}`,
        args: [item.rewardPoolId, item.roundId],
        functionName: "claimQuestionReward",
      };
    }

    if (item.claimType === "question_bundle_reward") {
      if (!questionRewardPoolEscrowInfo) throw new Error("Question reward escrow is unavailable right now.");
      return {
        abi: questionRewardPoolEscrowInfo.abi as Abi,
        address: questionRewardPoolEscrowInfo.address as `0x${string}`,
        args: [item.bundleId, item.roundSetIndex],
        functionName: "claimQuestionBundleReward",
      };
    }

    if (!distributorInfo) throw new Error("Round reward distributor is unavailable right now.");
    if (item.claimType === "participation_reward") {
      return {
        abi: distributorInfo.abi as Abi,
        address: distributorInfo.address as `0x${string}`,
        args: [item.contentId, item.roundId],
        functionName: "claimParticipationReward",
      };
    }

    if (item.claimType === "frontend_round_fee") {
      return {
        abi: distributorInfo.abi as Abi,
        address: distributorInfo.address as `0x${string}`,
        args: [item.contentId, item.roundId, item.frontend],
        functionName: "claimFrontendFee",
      };
    }

    return {
      abi: distributorInfo.abi as Abi,
      address: distributorInfo.address as `0x${string}`,
      args: [item.contentId, item.roundId],
      functionName: "claimReward",
    };
  };

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
        const claimLabel = getClaimableRewardLabel(item);

        try {
          if (item.claimType === "frontend_registry_fee" && item.reward <= 0n && creditedFrontendRoundCount === 0) {
            continue;
          }

          if (canUseSponsoredSubmitCalls) {
            await executeSponsoredCalls([getSponsoredClaimCall(item)], { action: claimLabel });
            if (item.claimType === "frontend_round_fee") {
              creditedFrontendRoundCount += 1;
            }
          } else if (item.claimType === "refund") {
            await (writeVotingEngine as any)(
              {
                functionName: "claimCancelledRoundRefund",
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
            await (writeFrontendRegistry as any)(
              {
                functionName: "claimFees",
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else if (item.claimType === "question_reward") {
            await (writeQuestionRewardPoolEscrow as any)(
              {
                functionName: "claimQuestionReward",
                args: [item.rewardPoolId, item.roundId],
              },
              { getErrorMessage: getTransactionErrorMessage },
            );
          } else if (item.claimType === "question_bundle_reward") {
            if (!questionRewardPoolEscrowAddress) {
              throw new Error("Question reward escrow is not configured");
            }
            await (writeQuestionRewardPoolEscrow as any)(
              {
                address: questionRewardPoolEscrowAddress,
                abi: QUESTION_REWARD_POOL_ESCROW_ABI,
                functionName: "claimQuestionBundleReward",
                args: [item.bundleId, item.roundSetIndex],
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
      isAwaitingFreeTransactionAllowance ||
      isAwaitingSelfFundedWalletReconnect ||
      isAwaitingSponsoredSubmitCalls ||
      isAwaitingSponsoredWalletReconnect,
    progress,
  };
}
