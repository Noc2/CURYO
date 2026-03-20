"use client";

import { useRef, useState } from "react";
import { CuryoReputationAbi, encodeVoteTransferPayload } from "@curyo/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useTransactor } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getRecentUserVotesQueryKey } from "~~/hooks/useRecentUserVotes";
import { getVoteHistoryQueryKey } from "~~/hooks/useVoteHistoryQuery";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { useVotingConfig } from "~~/hooks/useVotingConfig";
import {
  type WalletDisplaySummary,
  getWalletDisplaySummaryQueryKey,
  persistWalletDisplaySummarySnapshot,
} from "~~/hooks/useWalletDisplaySummary";
import { buildCommitVoteParams } from "~~/lib/contracts/roundVotingEngine";
import { isFreeTransactionExhaustedError } from "~~/lib/transactionErrors";
import { VOTE_COOLDOWN_SECONDS } from "~~/lib/vote/cooldown";
import scaffoldConfig from "~~/scaffold.config";
import { getParsedErrorWithAllAbis } from "~~/utils/scaffold-eth/contract";

interface RoundVoteParams {
  contentId: bigint;
  isUp: boolean;
  stakeAmount: number; // In whole tokens (e.g., 5 = 5 cREP)
  frontendCode?: `0x${string}`; // Optional frontend operator address for fee distribution
  submitter?: string; // Content submitter address (for self-vote prevention)
}

function normalizeRoundVoteError(message: string) {
  if (message.toLowerCase().includes("free transactions used up")) {
    return "Free transactions used up. Add CELO to continue.";
  }
  if (message.includes("CooldownActive")) {
    return `You already voted on this content within the last ${Math.round(VOTE_COOLDOWN_SECONDS / 3600)} hours. Try again after the cooldown ends.`;
  }
  if (message.includes("AlreadyCommitted")) {
    return "You already have a vote committed on this content in the current round.";
  }
  if (message.includes("MaxVotersReached")) {
    return "This round is full. Wait for the next round to vote again.";
  }
  if (message.includes("SelfVote")) {
    return "You cannot vote on your own content.";
  }
  if (message.includes("ContentNotActive")) {
    return "This content is no longer active for voting.";
  }
  if (message.includes("RoundNotAccepting") || message.includes("RoundNotOpen")) {
    return "This round is not accepting votes right now.";
  }
  if (message.includes("VoterIdRequired")) {
    return "Voter ID required. Please verify your identity to vote.";
  }
  return message;
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
  const { targetNetwork } = useTargetNetwork();
  const { hasVoterId, tokenId } = useVoterIdNFT(address);
  const [isCommitting, setIsCommitting] = useState(false);
  const commitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { requireAcceptance } = useTermsAcceptance();
  const queryClient = useQueryClient();
  const { epochDuration } = useVotingConfig();
  const writeTx = useTransactor();
  const wagmiTokenWrite = useWriteContract();

  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" } as any);
  const { data: crepInfo } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const publicClient = usePublicClient();

  const commitVote = async ({ contentId, isUp, stakeAmount, frontendCode, submitter }: RoundVoteParams) => {
    const accepted = await requireAcceptance("vote");
    if (!accepted) return false;

    if (!address) {
      setError("Please connect your wallet");
      return false;
    }

    if (submitter && address && submitter.toLowerCase() === address.toLowerCase()) {
      setError("Cannot vote on own content");
      return false;
    }

    if (!hasVoterId) {
      setError("Voter ID required. Please verify your identity to vote.");
      return false;
    }

    if (!votingEngineInfo?.address) {
      setError("RoundVotingEngine contract not deployed");
      return false;
    }

    if (!crepInfo?.address) {
      setError("cREP token contract not deployed");
      return false;
    }

    // Synchronous guard against double-submission (React state updates are async)
    if (commitLock.current) return false;
    commitLock.current = true;
    setIsCommitting(true);
    setError(null);

    try {
      const { ciphertext, commitHash, frontend, stakeWei } = await buildCommitVoteParams({
        contentId,
        isUp,
        stakeAmount,
        epochDuration,
        frontendCode,
        defaultFrontendCode: scaffoldConfig.frontendCode,
      });

      const payload = encodeVoteTransferPayload({
        contentId,
        commitHash,
        ciphertext,
        frontend,
      });

      const transferAndCallRequest: any = {
        abi: CuryoReputationAbi,
        address: crepInfo.address,
        functionName: "transferAndCall",
        args: [votingEngineInfo.address, stakeWei, payload] as const,
      };

      if (publicClient) {
        const estimatedGas = await publicClient.estimateContractGas({
          address: crepInfo.address,
          abi: CuryoReputationAbi,
          functionName: "transferAndCall",
          args: [votingEngineInfo.address, stakeWei, payload],
          account: address,
        });
        transferAndCallRequest.gas = (estimatedGas * 120n) / 100n;
      }

      wagmiTokenWrite.reset();
      await writeTx(() => wagmiTokenWrite.writeContractAsync(transferAndCallRequest));

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
      }>(["ponder-fallback", "votingStakes", address], old => {
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
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "votingStakes", address] });
      queryClient.invalidateQueries({ queryKey: getRecentUserVotesQueryKey(address) });
      queryClient.invalidateQueries({ queryKey: getVoteHistoryQueryKey(address) });

      return true;
    } catch (e: any) {
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
    hasVoterId,
    tokenId,
  };
}
