"use client";

import { useCallback, useEffect } from "react";
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

const VOTER_ID_CACHE_KEY = "curyo:voterIdNFT";

interface VoterIdCache {
  hasVoterId: boolean;
  tokenId: string; // bigint serialized
}

function readVoterIdCache(address: string): VoterIdCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${VOTER_ID_CACHE_KEY}:${address.toLowerCase()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.hasVoterId !== "boolean" || typeof parsed.tokenId !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeVoterIdCache(address: string, hasVoterId: boolean, tokenId: bigint) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${VOTER_ID_CACHE_KEY}:${address.toLowerCase()}`,
      JSON.stringify({ hasVoterId, tokenId: tokenId.toString() }),
    );
  } catch {
    // localStorage full or unavailable — ignore
  }
}

/**
 * Hook to check if an address has a Voter ID NFT.
 * Seeds initial state from localStorage to avoid loading flash on navigation.
 */
export function useVoterIdNFT(address?: string) {
  const cached = address ? readVoterIdCache(address) : null;

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
      initialData: cached?.hasVoterId,
    },
  } as any);

  // Use cached hasVoterId to enable tokenId query immediately (avoids sequential waterfall)
  const hasVoterIdResolved = hasVoterId ?? cached?.hasVoterId ?? false;

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
      enabled: !!address && hasVoterIdResolved === true,
      initialData: cached?.hasVoterId && cached.tokenId ? BigInt(cached.tokenId) : undefined,
    },
  } as any);

  // Persist to localStorage when fresh data arrives
  useEffect(() => {
    if (address && hasVoterId !== undefined) {
      writeVoterIdCache(address, hasVoterId as boolean, (tokenId as bigint) ?? 0n);
    }
  }, [address, hasVoterId, tokenId]);

  const refetch = useCallback(() => {
    refetchHasVoterId();
    refetchTokenId();
  }, [refetchHasVoterId, refetchTokenId]);

  const hasAddress = Boolean(address);
  const contractUnavailable = hasAddress && !voterIdContractLoading && !voterIdContract;
  const resolvedHasVoterId = (hasVoterId as boolean | undefined) ?? cached?.hasVoterId ?? false;
  const voterIdCheckPending =
    hasAddress &&
    !contractUnavailable &&
    !cached && // skip pending state when we have cached data
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
    !cached?.tokenId && // skip pending state when we have cached data
    isInitialQueryPending({
      isLoading: tokenIdLoading,
      isFetching: tokenIdFetching,
      isFetched: tokenIdFetched,
      isError: tokenIdError,
    });
  const isResolved = !hasAddress || contractUnavailable || (!voterIdCheckPending && !tokenIdCheckPending);

  return {
    hasVoterId: resolvedHasVoterId,
    tokenId: tokenId ?? (cached?.tokenId ? BigInt(cached.tokenId) : 0n),
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
