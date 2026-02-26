"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, usePublicClient } from "wagmi";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import scaffoldConfig from "~~/scaffold.config";
import { computeCommitHash, encryptVote, generateSalt, getRoundSalt, storeRoundSalt } from "~~/utils/tlock";

interface RoundVoteParams {
  contentId: bigint;
  isUp: boolean;
  stakeAmount: number; // In whole tokens (e.g., 5 = 5 cREP)
  frontendCode?: `0x${string}`; // Optional frontend operator address for fee distribution
  submitter?: string; // Content submitter address (for self-vote prevention)
}

/**
 * Hook for round-based voting with tlock encryption using cREP tokens.
 * Handles: salt generation -> commit hash -> tlock encrypt to epoch end -> token approval -> commitVote tx.
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

    // Read the active round ID for this content from the contract
    let roundId: bigint;
    try {
      if (publicClient && votingEngineInfo) {
        const onChainRoundId = await publicClient.readContract({
          address: votingEngineInfo.address,
          abi: votingEngineInfo.abi,
          functionName: "getActiveRoundId",
          args: [contentId],
        });
        roundId = onChainRoundId as bigint;
      } else {
        setError("Unable to read active round ID");
        commitLock.current = false;
        setIsCommitting(false);
        return false;
      }
    } catch (e: any) {
      console.error("Failed to read active round ID:", e);
      setError("Failed to read active round. Content may not be eligible for voting.");
      commitLock.current = false;
      setIsCommitting(false);
      return false;
    }

    // Read round data to get startTime for epoch computation
    // If roundId === 0n, this is the first vote — the contract will create a new round.
    // Use current time as the start time since the contract will set startTime = block.timestamp.
    let roundStartTime: number;
    let epochDuration = 900; // default 15 minutes
    try {
      if (publicClient && votingEngineInfo && roundId > 0n) {
        const roundData = await publicClient.readContract({
          address: votingEngineInfo.address,
          abi: votingEngineInfo.abi,
          functionName: "getRound",
          args: [contentId, roundId],
        });
        const round = roundData as { startTime: bigint };
        roundStartTime = Number(round.startTime);

        // Read config for epochDuration
        try {
          const configData = await publicClient.readContract({
            address: votingEngineInfo.address,
            abi: votingEngineInfo.abi,
            functionName: "config",
            args: [],
          });
          const config = configData as [bigint, bigint, bigint, bigint];
          epochDuration = Number(config[0]); // first field is epochDuration
        } catch {
          // Fall back to default 900s (15 min)
        }
      } else if (roundId === 0n) {
        // First voter: no round exists yet. The contract will create one with startTime = block.timestamp.
        // Use current time as approximation.
        roundStartTime = Math.floor(Date.now() / 1000);

        // Still try to read config for epochDuration
        if (publicClient && votingEngineInfo) {
          try {
            const configData = await publicClient.readContract({
              address: votingEngineInfo.address,
              abi: votingEngineInfo.abi,
              functionName: "config",
              args: [],
            });
            const config = configData as [bigint, bigint, bigint, bigint];
            epochDuration = Number(config[0]);
          } catch {
            // Fall back to default 900s
          }
        }
      } else {
        setError("Unable to read round data");
        commitLock.current = false;
        setIsCommitting(false);
        return false;
      }
    } catch (e: any) {
      console.error("Failed to read round data:", e);
      setError("Failed to read round data.");
      commitLock.current = false;
      setIsCommitting(false);
      return false;
    }

    // Guard: prevent duplicate vote on same content in same round
    const existingVote = getRoundSalt(contentId, roundId, address);
    if (existingVote) {
      setError("Already voted on this content in the current round");
      commitLock.current = false;
      setIsCommitting(false);
      return false;
    }

    try {
      // 1. Generate random salt
      const salt = generateSalt();

      // 2. Compute commit hash: keccak256(abi.encodePacked(isUp, salt, contentId))
      const commitHash = computeCommitHash(isUp, salt, contentId);

      // 3. Calculate tlock encryption target: end of current epoch
      const nowSeconds = Math.floor(Date.now() / 1000);
      const epochIndex = Math.floor((nowSeconds - roundStartTime) / epochDuration);
      const epochEnd = roundStartTime + (epochIndex + 1) * epochDuration;

      // 4. Encrypt vote with tlock to the epoch end time
      const ciphertext = await encryptVote(isUp, salt, contentId, epochEnd);

      // Convert to 6 decimals (cREP uses 6 decimals)
      const stakeWei = BigInt(stakeAmount * 1e6);

      // 5. Approve tokens if needed, then commit vote
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

      // 6. Re-check wallet connection before submitting the vote
      if (!address) {
        setError("Wallet disconnected after approval. Your allowance is set — please reconnect and retry.");
        return false;
      }

      // 7. Submit the commit vote transaction
      await (writeVoting as any)({
        functionName: "commitVote",
        args: [contentId, commitHash, ciphertext, stakeWei, frontend],
      });

      // 8. Re-read the actual on-chain round ID after the commit tx is mined,
      // since the contract may have advanced the round between our read and the tx.
      let actualRoundId = roundId;
      if (publicClient && votingEngineInfo) {
        try {
          const onChainRoundId = await publicClient.readContract({
            address: votingEngineInfo.address,
            abi: votingEngineInfo.abi,
            functionName: "getActiveRoundId",
            args: [contentId],
          });
          actualRoundId = onChainRoundId as bigint;
        } catch {
          // Fall back to previously read round ID
        }
      }

      // 9. Store salt locally (and stake for "Your vote" UI)
      if (!address) {
        setError("Wallet disconnected during vote");
        return false;
      }
      storeRoundSalt(contentId, actualRoundId, salt, isUp, address, stakeAmount);

      // Immediately refetch voting stakes so the navbar staked amount updates
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "votingStakes"] });

      return true;
    } catch (e: any) {
      console.error("Round vote failed:", e);
      setError(e?.shortMessage || e?.message || "Failed to commit vote");
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
