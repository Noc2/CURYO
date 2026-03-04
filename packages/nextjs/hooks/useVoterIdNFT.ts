"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Hook to check if an address has a Voter ID NFT.
 */
export function useVoterIdNFT(address?: string) {
  const {
    data: hasVoterId,
    isLoading: hasVoterIdLoading,
    refetch: refetchHasVoterId,
  } = useScaffoldReadContract({
    contractName: "VoterIdNFT" as any,
    functionName: "hasVoterId",
    args: [address],
    query: {
      enabled: !!address,
    },
  } as any);

  const {
    data: tokenId,
    isLoading: tokenIdLoading,
    refetch: refetchTokenId,
  } = useScaffoldReadContract({
    contractName: "VoterIdNFT" as any,
    functionName: "getTokenId",
    args: [address],
    query: {
      enabled: !!address,
    },
  } as any);

  const refetch = () => {
    refetchHasVoterId();
    refetchTokenId();
  };

  return {
    hasVoterId: hasVoterId ?? false,
    tokenId: tokenId ?? 0n,
    isLoading: hasVoterIdLoading || tokenIdLoading,
    refetch,
  };
}

/**
 * Hook to get the current stake for a Voter ID on a specific content in a round.
 */
export function useVoterIdStake(contentId?: bigint, epochId?: bigint, tokenId?: bigint) {
  const {
    data: stakedAmount,
    isLoading,
    refetch,
  } = useScaffoldReadContract({
    contractName: "VoterIdNFT" as any,
    functionName: "getEpochContentStake",
    args: [contentId, epochId, tokenId],
    query: {
      enabled: contentId !== undefined && epochId !== undefined && tokenId !== undefined && tokenId > 0n,
    },
  } as any);

  const {
    data: remainingCapacity,
    isLoading: remainingLoading,
    refetch: refetchRemaining,
  } = useScaffoldReadContract({
    contractName: "VoterIdNFT" as any,
    functionName: "getRemainingStakeCapacity",
    args: [contentId, epochId, tokenId],
    query: {
      enabled: contentId !== undefined && epochId !== undefined && tokenId !== undefined && tokenId > 0n,
    },
  } as any);

  const refetchAll = () => {
    refetch();
    refetchRemaining();
  };

  // Default to full capacity (100 cREP) when query is disabled (no active round yet)
  const MAX_STAKE = 100_000_000n; // 100e6 — matches VoterIdNFT.MAX_STAKE_PER_VOTER
  return {
    stakedAmount: stakedAmount ?? 0n,
    remainingCapacity: remainingCapacity ?? MAX_STAKE,
    isLoading: isLoading || remainingLoading,
    refetch: refetchAll,
  };
}
