"use client";

import { useCallback, useRef, useState } from "react";
import { CuryoReputationAbi, encodeVoteTransferPayload } from "@curyo/contracts";
import { buildCommitVoteParams } from "@curyo/sdk/vote";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useTransactor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { FREE_TRANSACTION_ALLOWANCE_QUERY_KEY } from "~~/hooks/useFreeTransactionAllowance";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { getRecentUserVotesQueryKey } from "~~/hooks/useRecentUserVotes";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import { getVoteHistoryQueryKey } from "~~/hooks/useVoteHistoryQuery";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { getVotingStakesQueryKey } from "~~/hooks/useVotingStakes";
import {
  type WalletDisplaySummary,
  getWalletDisplaySummaryQueryKey,
  persistWalletDisplaySummarySnapshot,
} from "~~/hooks/useWalletDisplaySummary";
import { DEFAULT_VOTING_CONFIG, type VotingConfig } from "~~/lib/contracts/roundVotingEngine";
import { getGasBalanceErrorMessage, isFreeTransactionExhaustedError } from "~~/lib/transactionErrors";
import { recordLocalVoteCooldown } from "~~/lib/vote/localCooldown";
import { normalizeRoundVoteError } from "~~/lib/vote/roundVoteErrors";
import { resolveRoundVoteRuntime } from "~~/lib/vote/roundVoteRuntime";
import scaffoldConfig from "~~/scaffold.config";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

interface RoundVoteParams {
  contentId: bigint;
  isUp: boolean;
  stakeAmount: number; // In whole tokens (e.g., 5 = 5 cREP)
  frontendCode?: `0x${string}`; // Optional frontend operator address for fee distribution
  isOwnContent?: boolean;
  roundConfig?: VotingConfig | null;
  submitter?: string; // Content submitter address (for self-vote prevention)
}

/**
 * Hook for tlock commit-reveal round voting using cREP transferAndCall.
 * Handles: atomic token transfer + vote commit in a single transaction.
 *
 * Vote direction is tlock-encrypted to the current epoch's drand round,
 * ensuring vote secrecy until the epoch ends. The keeper decrypts and
 * reveals votes after each epoch.
 */
export function useRoundVote() {
  const { address } = useAccount();
  const { addOptimisticVote } = useOptimisticVote();
  const { targetNetwork } = useTargetNetwork();
  const { hasVoterId, tokenId } = useVoterIdNFT(address);
  const [isCommitting, setIsCommitting] = useState(false);
  const commitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { requireAcceptance } = useTermsAcceptance();
  const queryClient = useQueryClient();
  const writeTx = useTransactor();
  const wagmiTokenWrite = useWriteContract();
  const {
    canUseSponsoredSubmitCalls,
    executeSponsoredCalls,
    isAwaitingSelfFundedSubmitCalls,
    isAwaitingSponsoredSubmitCalls,
  } = useThirdwebSponsoredSubmitCalls();
  const { canSponsorTransactions, isMissingGasBalance, nativeTokenSymbol } = useGasBalanceStatus({
    includeExternalSendCalls: true,
  });

  const { data: votingEngineInfo, isLoading: isVotingEngineLoading } = useDeployedContractInfo({
    contractName: "RoundVotingEngine",
  } as any);
  const { data: crepInfo, isLoading: isCrepLoading } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const publicClient = usePublicClient();
  const clearError = useCallback(() => setError(null), []);

  const commitVote = async ({
    contentId,
    isUp,
    stakeAmount,
    frontendCode,
    isOwnContent,
    roundConfig,
    submitter,
  }: RoundVoteParams) => {
    const accepted = await requireAcceptance("vote");
    if (!accepted) return false;

    if (!address) {
      setError("Please connect your wallet");
      return false;
    }

    if (isOwnContent || (submitter && address && submitter.toLowerCase() === address.toLowerCase())) {
      setError(normalizeRoundVoteError("SelfVote"));
      return false;
    }

    if (!hasVoterId) {
      setError("Voter ID required. Please verify your identity to vote.");
      return false;
    }

    if (isVotingEngineLoading || isCrepLoading) {
      setError("Preparing vote. Try again in a moment.");
      return false;
    }

    if (!votingEngineInfo?.address || !crepInfo?.address) {
      setError("Voting is unavailable right now.");
      return false;
    }

    if (isAwaitingSponsoredSubmitCalls) {
      setError("Preparing wallet. Try again in a moment.");
      return false;
    }

    if (isAwaitingSelfFundedSubmitCalls) {
      setError("Wallet switching to paid gas. Retry in a moment.");
      return false;
    }

    if (isMissingGasBalance) {
      setError(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
      return false;
    }

    // Synchronous guard against double-submission (React state updates are async)
    if (commitLock.current) return false;
    commitLock.current = true;
    setIsCommitting(true);
    setError(null);

    try {
      let runtime;
      if (publicClient) {
        try {
          runtime = await resolveRoundVoteRuntime({
            publicClient,
            votingEngineAddress: votingEngineInfo.address as `0x${string}`,
            contentId,
            fallbackEpochDuration: roundConfig?.epochDuration ?? DEFAULT_VOTING_CONFIG.epochDuration,
          });
        } catch (runtimeError) {
          console.warn("[round-vote] failed to anchor tlock target to the active round.", {
            contentId: contentId.toString(),
            error: runtimeError,
          });
          setError("Preparing vote. Try again in a moment.");
          return false;
        }
      }

      if (!runtime) {
        setError("Preparing vote. Try again in a moment.");
        return false;
      }

      const { ciphertext, commitHash, roundReferenceRatingBps, targetRound, drandChainHash, frontend, stakeWei } =
        await buildCommitVoteParams({
          contentId,
          isUp,
          stakeAmount,
          epochDuration: runtime.epochDuration,
          roundReferenceRatingBps: runtime.roundReferenceRatingBps,
          frontendCode,
          defaultFrontendCode: scaffoldConfig.frontendCode,
          runtime,
        });

      const payload = encodeVoteTransferPayload({
        contentId,
        roundReferenceRatingBps,
        commitHash,
        ciphertext,
        targetRound,
        drandChainHash,
        frontend,
      });
      const transferAndCallArgs = [votingEngineInfo.address, stakeWei, payload] as const;
      const transferAndCallRequest: any = {
        abi: CuryoReputationAbi,
        address: crepInfo.address,
        functionName: "transferAndCall",
        args: transferAndCallArgs,
      };

      if (canUseSponsoredSubmitCalls) {
        await executeSponsoredCalls(
          [
            {
              abi: CuryoReputationAbi,
              address: crepInfo.address as `0x${string}`,
              args: transferAndCallArgs,
              functionName: "transferAndCall",
            },
          ],
          { action: "vote" },
        );
      }

      // Direct writes are self-funded here; only the sponsored helper can
      // safely confirm free-transaction reservations with the backend.
      if (!canUseSponsoredSubmitCalls && publicClient) {
        const estimatedGas = await publicClient.estimateContractGas({
          address: crepInfo.address,
          abi: CuryoReputationAbi,
          functionName: "transferAndCall",
          args: transferAndCallArgs,
          account: address,
        });
        transferAndCallRequest.gas = (estimatedGas * 120n) / 100n;
      }

      if (!canUseSponsoredSubmitCalls) {
        wagmiTokenWrite.reset();
        const transactionHash = await writeTx(() => wagmiTokenWrite.writeContractAsync(transferAndCallRequest), {
          action: "vote",
          suppressSuccessToast: true,
        });
        if (!transactionHash) {
          return false;
        }
      }

      addOptimisticVote(contentId, stakeWei);
      recordLocalVoteCooldown({
        address,
        chainId: targetNetwork.id,
        contentId,
        voterIdTokenId: tokenId,
      });
      void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });

      queryClient.setQueryData<WalletDisplaySummary | undefined>(
        getWalletDisplaySummaryQueryKey(address.toLowerCase()),
        current => {
          if (!current || current.liquidMicro < stakeWei) return current;
          const nextSnapshot: WalletDisplaySummary = {
            ...current,
            liquidMicro: current.liquidMicro - stakeWei,
            votingStakedMicro: current.votingStakedMicro + stakeWei,
            totalStakedMicro: current.totalStakedMicro + stakeWei,
            totalMicro: current.totalMicro,
            updatedAt: Date.now(),
          };
          persistWalletDisplaySummarySnapshot(address.toLowerCase(), nextSnapshot);
          return nextSnapshot;
        },
      );

      queryClient.setQueryData<{
        data: { activeStaked: number; activeCount: number; totalVotingStake: number };
        source: string;
      }>(getVotingStakesQueryKey(address, targetNetwork.id), old => {
        if (!old?.data) return old;
        const added = Number(stakeWei) / 1e6;
        return {
          ...old,
          data: {
            activeStaked: old.data.activeStaked + added,
            activeCount: old.data.activeCount + 1,
            totalVotingStake: old.data.totalVotingStake + added,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: getVotingStakesQueryKey(address, targetNetwork.id) });
      queryClient.invalidateQueries({ queryKey: getRecentUserVotesQueryKey(address, targetNetwork.id) });
      queryClient.invalidateQueries({ queryKey: getVoteHistoryQueryKey(address, targetNetwork.id) });

      return true;
    } catch (e: any) {
      void queryClient.invalidateQueries({ queryKey: FREE_TRANSACTION_ALLOWANCE_QUERY_KEY });
      console.error("Round vote commit failed:", e);
      if (isFreeTransactionExhaustedError(e)) {
        setError("Free transactions used up. Add CELO to continue.");
        return false;
      }
      const parsedError = getParsedErrorWithAllAbis(e, targetNetwork.id as any);
      setError(normalizeRoundVoteError(parsedError || e?.shortMessage || e?.message || "Failed to submit vote"));
      return false;
    } finally {
      commitLock.current = false;
      setIsCommitting(false);
    }
  };

  return {
    commitVote,
    isCommitting,
    error,
    clearError,
    hasVoterId,
    tokenId,
  };
}
