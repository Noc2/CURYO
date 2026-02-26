"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Hook to read round state for a content item.
 * During open round: shows voteCount, revealedCount, totalStake (blind stats).
 * After reveals: shows upPool, downPool, upCount, downCount (cumulative across epochs).
 * Shows "X of 3 voters needed" progress based on revealedCount.
 * Returns optimistic vote deltas for instant UI updates.
 */
export function useRoundInfo(contentId?: bigint) {
  // Get optimistic vote deltas for instant UI updates
  const { getOptimisticDelta } = useOptimisticVote();
  const optimistic = contentId !== undefined ? getOptimisticDelta(contentId) : undefined;

  const publicClient = usePublicClient();
  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" } as any);

  // Read config for minVoters and maxVoters
  const [minVoters, setMinVoters] = useState(3);
  const [maxVoters, setMaxVoters] = useState(1000);

  useEffect(() => {
    if (!publicClient || !votingEngineInfo) return;

    let cancelled = false;

    publicClient
      .readContract({
        address: votingEngineInfo.address,
        abi: votingEngineInfo.abi,
        functionName: "config",
        args: [],
      })
      .then((data: any) => {
        if (cancelled) return;
        const config = data as [bigint, bigint, bigint, bigint];
        setMinVoters(Number(config[2])); // minVoters
        setMaxVoters(Number(config[3])); // maxVoters
      })
      .catch(() => {
        // Fall back to default
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, votingEngineInfo]);

  // Local clock kept for potential future use (countdown, freshness checks)
  const [, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  // Active round ID for this content
  const { data: rawActiveRoundId } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getActiveRoundId" as any,
    args: [contentId] as any,
    query: {
      enabled: contentId !== undefined,
      refetchInterval: 5000,
    },
  } as any);
  const activeRoundId = rawActiveRoundId as unknown as bigint | undefined;

  // Round data for this content
  const { data: rawRoundData, isLoading: isRoundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getRound" as any,
    args: [contentId, activeRoundId] as any,
    query: {
      enabled: contentId !== undefined && activeRoundId !== undefined && activeRoundId > 0n,
      refetchInterval: 5000,
    },
  } as any);

  const roundId = activeRoundId ?? 0n;
  const isLoading = contentId !== undefined && isRoundLoading;

  // Parse round data from contract
  // New struct: { startTime, state, voteCount, revealedCount, totalStake, upPool, downPool, upCount, downCount, upWins }
  const round = rawRoundData as unknown as
    | {
        startTime: bigint;
        state: number;
        voteCount: bigint;
        revealedCount: bigint;
        totalStake: bigint;
        upPool: bigint;
        downPool: bigint;
        upCount: bigint;
        downCount: bigint;
        upWins: boolean;
      }
    | undefined;

  // Merge optimistic deltas
  const optimisticVoteCount = BigInt(optimistic?.voteCount ?? 0);
  const optimisticStake = optimistic?.stake ?? 0n;

  // Base values from contract (or defaults if no round data)
  const baseVoteCount = round?.voteCount ?? 0n;
  const baseTotalStake = round?.totalStake ?? 0n;
  const state = round?.state ?? 0;
  const revealedCount = round ? Number(round.revealedCount) : 0;

  // Revealed data (available after any reveals have occurred)
  const hasReveals = revealedCount > 0;
  const upPool = hasReveals ? (round?.upPool ?? 0n) : 0n;
  const downPool = hasReveals ? (round?.downPool ?? 0n) : 0n;
  const upCount = hasReveals ? (round?.upCount ?? 0n) : 0n;
  const downCount = hasReveals ? (round?.downCount ?? 0n) : 0n;

  // Settlement readiness: need at least minVoters revealed votes
  const votersNeeded = Math.max(0, minVoters - revealedCount);
  const readyToSettle = state === 0 && revealedCount >= minVoters;

  // Round capacity: is the round full?
  const isRoundFull = Number(baseVoteCount + optimisticVoteCount) >= maxVoters;

  return {
    roundId,
    round: {
      state,
      startTime: round ? Number(round.startTime) : 0,
      // During open round: blind stats (with optimistic overlay)
      voteCount: baseVoteCount + optimisticVoteCount,
      revealedCount,
      totalStake: baseTotalStake + optimisticStake,
      // After reveal: full pool breakdown (cumulative across epochs)
      upPool,
      downPool,
      upCount,
      downCount,
      upWins: round?.upWins ?? false,
    },
    isLoading,
    hasReveals,
    votersNeeded,
    minVoters,
    maxVoters,
    isRoundFull,
    readyToSettle,
  };
}
