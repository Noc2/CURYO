"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import scaffoldConfig from "~~/scaffold.config";

interface RoundVoteParams {
  contentId: bigint;
  isUp: boolean;
  stakeAmount: number; // In whole tokens (e.g., 5 = 5 cREP)
  frontendCode?: `0x${string}`; // Optional frontend operator address for fee distribution
  submitter?: string; // Content submitter address (for self-vote prevention)
}

/**
 * Hook for public round-based voting using cREP tokens.
 * Handles: token approval -> vote() tx.
 * Votes are immediately public (no commit-reveal).
 */
export function useRoundVote() {
  const { address } = useAccount();
  const { hasVoterId, tokenId } = useVoterIdNFT(address);
  const [isCommitting, setIsCommitting] = useState(false);
  const commitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { requireAcceptance } = useTermsAcceptance();
  const queryClient = useQueryClient();

  // Write contract for cREP token
  const { writeContractAsync: writeCRep } = useScaffoldWriteContract({
    contractName: "CuryoReputation",
  });

  const { writeContractAsync: writeVoting } = useScaffoldWriteContract({
    contractName: "RoundVotingEngine" as any,
  });

  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" } as any);
  const { data: crepInfo } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const publicClient = usePublicClient();

  const commitVote = async ({ contentId, isUp, stakeAmount, frontendCode, submitter }: RoundVoteParams) => {
    // Require terms acceptance before voting
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
      // Convert to 6 decimals (cREP uses 6 decimals)
      const stakeWei = BigInt(stakeAmount * 1e6);

      // Approve tokens if needed, then vote
      const frontend = frontendCode ?? scaffoldConfig.frontendCode ?? "0x0000000000000000000000000000000000000000";

      // Check current allowance and only approve if insufficient
      if (publicClient && crepInfo) {
        const currentAllowance = await publicClient.readContract({
          address: crepInfo.address,
          abi: crepInfo.abi,
          functionName: "allowance",
          args: [address, votingEngineInfo.address],
        });
        if ((currentAllowance as bigint) < stakeWei) {
          await writeCRep({
            functionName: "approve",
            args: [votingEngineInfo.address, stakeWei],
          });

          // Verify allowance was actually set on-chain before proceeding.
          // MetaMask can return a tx hash before Anvil has mined the block,
          // causing the next call to fail with ERC20InsufficientAllowance.
          for (let i = 0; i < 20; i++) {
            const newAllowance = await publicClient.readContract({
              address: crepInfo.address,
              abi: crepInfo.abi,
              functionName: "allowance",
              args: [address, votingEngineInfo.address],
            });
            if ((newAllowance as bigint) >= stakeWei) break;
            if (i === 19)
              throw new Error(
                "Token approval was not confirmed on-chain. Try resetting your wallet activity (MetaMask → Settings → Advanced → Clear activity tab data).",
              );
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }
      } else {
        await writeCRep({
          functionName: "approve",
          args: [votingEngineInfo.address, stakeWei],
        });
      }

      // Re-check wallet connection before submitting the vote
      if (!address) {
        setError("Wallet disconnected after approval. Your allowance is set — please reconnect and retry.");
        return false;
      }

      // Submit the public vote transaction
      await (writeVoting as any)({
        functionName: "vote",
        args: [contentId, isUp, stakeWei, frontend],
      });

      // Immediately refetch voting stakes so the navbar staked amount updates
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "votingStakes"] });

      return true;
    } catch (e: any) {
      console.error("Round vote failed:", e);
      setError(e?.shortMessage || e?.message || "Failed to submit vote");
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
