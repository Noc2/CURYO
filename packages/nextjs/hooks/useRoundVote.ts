"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { encodePacked, keccak256 } from "viem";
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
 * Hook for tlock commit-reveal round voting using cREP tokens.
 * Handles: token approval -> commitVote() tx.
 *
 * In mockMode (local dev): ciphertext = abi.encodePacked(uint8 isUp, bytes32 salt, uint256 contentId)
 * In production: ciphertext would be tlock-encrypted via drand (TODO: integrate @drand/tlock-js)
 *
 * The keeper automatically reveals votes after each epoch ends.
 */
export function useRoundVote() {
  const { address } = useAccount();
  const { hasVoterId, tokenId } = useVoterIdNFT(address);
  const [isCommitting, setIsCommitting] = useState(false);
  const commitLock = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const { requireAcceptance } = useTermsAcceptance();
  const queryClient = useQueryClient();
  const [isMockMode, setIsMockMode] = useState(true); // Default to true for safety

  const { writeContractAsync: writeCRep } = useScaffoldWriteContract({
    contractName: "CuryoReputation",
  });

  const { writeContractAsync: writeVoting } = useScaffoldWriteContract({
    contractName: "RoundVotingEngine" as any,
  });

  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" } as any);
  const { data: crepInfo } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const publicClient = usePublicClient();

  // Read mockMode from contract once on mount
  useEffect(() => {
    if (!publicClient || !votingEngineInfo) return;

    let cancelled = false;

    publicClient
      .readContract({
        address: votingEngineInfo.address,
        abi: votingEngineInfo.abi,
        functionName: "mockMode",
        args: [],
      })
      .then((result: any) => {
        if (!cancelled) setIsMockMode(Boolean(result));
      })
      .catch(() => {
        // Default to mockMode=true (safe for local dev)
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, votingEngineInfo]);

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
      // Convert to 6 decimals (cREP uses 6 decimals)
      const stakeWei = BigInt(stakeAmount * 1e6);
      const frontend = frontendCode ?? scaffoldConfig.frontendCode ?? "0x0000000000000000000000000000000000000000";

      // Generate random 32-byte salt client-side
      const saltBytes = crypto.getRandomValues(new Uint8Array(32));
      const salt = `0x${Array.from(saltBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("")}` as `0x${string}`;

      // commitHash = keccak256(abi.encodePacked(isUp, salt, contentId))
      // This matches: keccak256(abi.encodePacked(isUp, salt, contentId)) in RoundVotingEngine
      const commitHash = keccak256(encodePacked(["bool", "bytes32", "uint256"], [isUp, salt, contentId]));

      let ciphertext: `0x${string}`;
      if (isMockMode) {
        // MockMode: 65-byte plaintext = abi.encodePacked(uint8(isUp?1:0), bytes32 salt, uint256 contentId)
        // The keeper decodes this directly without tlock decryption
        ciphertext = encodePacked(["uint8", "bytes32", "uint256"], [isUp ? 1 : 0, salt, contentId]);
      } else {
        // Production: tlock-encrypt plaintext = abi.encodePacked(uint8 isUp, bytes32 salt) to epoch end
        // TODO: integrate @drand/tlock-js for production tlock encryption
        // For now, fall back to mock encoding (not secure — keeper can read direction before reveal)
        ciphertext = encodePacked(["uint8", "bytes32", "uint256"], [isUp ? 1 : 0, salt, contentId]);
      }

      // Approve tokens if needed
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
            if (!address) throw new Error("Wallet disconnected during approval confirmation");
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

      // Re-check wallet connection before submitting
      if (!address) {
        setError("Wallet disconnected after approval. Your allowance is set — please reconnect and retry.");
        return false;
      }

      // Submit the encrypted vote commitment
      await (writeVoting as any)({
        functionName: "commitVote",
        args: [contentId, commitHash, ciphertext, stakeWei, frontend],
      });

      // Immediately refetch voting stakes so the navbar staked amount updates
      queryClient.invalidateQueries({ queryKey: ["ponder-fallback", "votingStakes"] });

      return true;
    } catch (e: any) {
      console.error("Round vote commit failed:", e);
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
