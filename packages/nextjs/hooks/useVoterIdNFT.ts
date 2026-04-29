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

export function shouldReadVoterIdTokenId({
  address,
  hasVoterId,
  hasVoterIdFetched,
}: {
  address?: string;
  hasVoterId: boolean | undefined;
  hasVoterIdFetched: boolean;
}) {
  return Boolean(address && hasVoterIdFetched && hasVoterId === true);
}

const VOTER_ID_CACHE_KEY = "curyo:voterIdNFT";

interface VoterIdCache {
  hasVoterId: boolean;
  tokenId: string; // bigint serialized
}

export function buildVoterIdCacheKey(contractAddress: string, address: string) {
  return `${VOTER_ID_CACHE_KEY}:${contractAddress.toLowerCase()}:${address.toLowerCase()}`;
}

function readVoterIdCache(contractAddress: string | undefined, address: string): VoterIdCache | null {
  if (!contractAddress) return null;
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(buildVoterIdCacheKey(contractAddress, address));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.hasVoterId !== "boolean" || typeof parsed.tokenId !== "string") return null;
    try {
      BigInt(parsed.tokenId);
    } catch {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeVoterIdCache(contractAddress: string | undefined, address: string, hasVoterId: boolean, tokenId: bigint) {
  if (!contractAddress) return;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      buildVoterIdCacheKey(contractAddress, address),
      JSON.stringify({ hasVoterId, tokenId: tokenId.toString() }),
    );
  } catch {
    // localStorage full or unavailable — ignore
  }
}

function clearVoterIdCache(contractAddress: string | undefined, address: string | undefined) {
  if (!contractAddress || !address) return;
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(buildVoterIdCacheKey(contractAddress, address));
  } catch {
    // localStorage unavailable — ignore
  }
}

/**
 * Hook to check if an address has a Voter ID NFT.
 * Seeds initial state from localStorage to avoid loading flash on navigation.
 */
export function useVoterIdNFT(address?: string) {
  const { data: voterIdContract, isLoading: voterIdContractLoading } = useDeployedContractInfo({
    contractName: "VoterIdNFT" as any,
  });
  const voterIdContractAddress = voterIdContract?.address;
  const cached = address ? readVoterIdCache(voterIdContractAddress, address) : null;

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
      placeholderData: cached?.hasVoterId,
    },
  } as any);

  const shouldReadTokenId = shouldReadVoterIdTokenId({
    address,
    hasVoterId: hasVoterIdError ? undefined : (hasVoterId as boolean | undefined),
    hasVoterIdFetched,
  });

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
      enabled: shouldReadTokenId,
      placeholderData: cached?.hasVoterId && cached.tokenId ? BigInt(cached.tokenId) : undefined,
    },
  } as any);

  // Persist to localStorage when fresh data arrives
  useEffect(() => {
    if (address && voterIdContractAddress && hasVoterIdFetched && hasVoterId !== undefined && !hasVoterIdError) {
      const hasFreshVoterId = hasVoterId as boolean;
      if (!hasFreshVoterId) {
        writeVoterIdCache(voterIdContractAddress, address, false, 0n);
      } else if (typeof tokenId === "bigint" && !tokenIdError) {
        writeVoterIdCache(voterIdContractAddress, address, true, tokenId);
      }
    }
  }, [address, hasVoterId, hasVoterIdError, hasVoterIdFetched, tokenId, tokenIdError, voterIdContractAddress]);

  useEffect(() => {
    if (hasVoterIdError || tokenIdError) {
      clearVoterIdCache(voterIdContractAddress, address);
    }
  }, [address, hasVoterIdError, tokenIdError, voterIdContractAddress]);

  const refetch = useCallback(async () => {
    const hasVoterIdResult = await refetchHasVoterId();
    if (hasVoterIdResult.data === true) {
      try {
        await refetchTokenId();
      } catch {
        // A Voter ID status refresh should not surface optional token-id reads.
      }
    }
    return { hasVoterId: hasVoterIdResult.data as boolean | undefined };
  }, [refetchHasVoterId, refetchTokenId]);

  const hasAddress = Boolean(address);
  const contractUnavailable = hasAddress && !voterIdContractLoading && !voterIdContract;
  const resolvedHasVoterId = hasVoterIdError
    ? false
    : ((hasVoterId as boolean | undefined) ?? cached?.hasVoterId ?? false);
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
    shouldReadTokenId &&
    !contractUnavailable &&
    !cached?.tokenId && // skip pending state when we have cached data
    isInitialQueryPending({
      isLoading: tokenIdLoading,
      isFetching: tokenIdFetching,
      isFetched: tokenIdFetched,
      isError: tokenIdError,
    });
  const isResolved = !hasAddress || contractUnavailable || (!voterIdCheckPending && !tokenIdCheckPending);
  const resolvedTokenId = resolvedHasVoterId
    ? tokenIdError
      ? 0n
      : (tokenId ?? (cached?.tokenId ? BigInt(cached.tokenId) : 0n))
    : 0n;

  return {
    hasVoterId: resolvedHasVoterId,
    tokenId: resolvedTokenId,
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

  // Default to full capacity (100 HREP) when query is disabled (no active round yet)
  const MAX_STAKE = 100_000_000n; // 100e6 — matches VoterIdNFT.MAX_STAKE_PER_VOTER
  return {
    stakedAmount: stakedAmount ?? 0n,
    remainingCapacity: remainingCapacity ?? MAX_STAKE,
    isLoading: isLoading || remainingLoading,
    refetch: refetchAll,
  };
}
