"use client";

import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export function isInitialQueryPending({
  isError,
  isFetched,
  isFetching,
  isLoading,
}: {
  isLoading: boolean;
  isFetching: boolean;
  isFetched: boolean;
  isError: boolean;
}) {
  if (isError || isFetched) {
    return false;
  }

  return isLoading || isFetching;
}

/**
 * Hook to check if an address has a Voter ID NFT.
 */
export function useVoterIdNFT(address?: string) {
  const { data: voterIdContract, isLoading: voterIdContractLoading } = useDeployedContractInfo({
    contractName: "VoterIdNFT" as any,
  });
  const {
    data: hasVoterId,
    isLoading: hasVoterIdLoading,
    isFetching: hasVoterIdFetching,
    isFetched: hasVoterIdFetched,
    isError: hasVoterIdError,
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
    isFetching: tokenIdFetching,
    isFetched: tokenIdFetched,
    isError: tokenIdError,
    refetch: refetchTokenId,
  } = useScaffoldReadContract({
    contractName: "VoterIdNFT" as any,
    functionName: "getTokenId",
    args: [address],
    query: {
      enabled: !!address && hasVoterId === true,
    },
  } as any);

  const refetch = () => {
    refetchHasVoterId();
    refetchTokenId();
  };

  const hasAddress = Boolean(address);
  const contractUnavailable = hasAddress && !voterIdContractLoading && !voterIdContract;
  const resolvedHasVoterId = hasVoterId ?? false;
  const voterIdCheckPending =
    hasAddress &&
    !contractUnavailable &&
    isInitialQueryPending({
      isLoading: hasVoterIdLoading,
      isFetching: hasVoterIdFetching,
      isFetched: hasVoterIdFetched,
      isError: hasVoterIdError,
    });
  const tokenIdCheckPending =
    hasAddress &&
    resolvedHasVoterId &&
    !contractUnavailable &&
    isInitialQueryPending({
      isLoading: tokenIdLoading,
      isFetching: tokenIdFetching,
      isFetched: tokenIdFetched,
      isError: tokenIdError,
    });
  const isResolved = !hasAddress || contractUnavailable || (!voterIdCheckPending && !tokenIdCheckPending);

  return {
    hasVoterId: resolvedHasVoterId,
    tokenId: tokenId ?? 0n,
    isLoading: !isResolved,
    isResolved,
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
