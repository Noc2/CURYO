"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Hook to read round state for a content item.
 * tlock commit-reveal: vote directions are hidden until epoch ends and keeper reveals them.
 * Returns optimistic vote deltas for instant UI updates after commitVote.
 */
export function useRoundInfo(contentId?: bigint) {
  const { getOptimisticDelta } = useOptimisticVote();
  const optimistic = contentId !== undefined ? getOptimisticDelta(contentId) : undefined;

  const publicClient = usePublicClient();
  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" } as any);

  // Read config for minVoters and maxVoters
  // RoundConfig struct: [epochDuration, maxDuration, minVoters, maxVoters]
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
        if (data.minVoters != null) {
          setMinVoters(Number(data.minVoters));
          setMaxVoters(Number(data.maxVoters));
        } else {
          // Positional tuple fallback: [epochDuration, maxDuration, minVoters, maxVoters]
          const config = data as any[];
          setMinVoters(Number(config[2])); // minVoters
          setMaxVoters(Number(config[3])); // maxVoters
        }
      })
      .catch(() => {
        // Fall back to default
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, votingEngineInfo]);

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
  // Round struct: { startTime, state, voteCount, revealedCount, totalStake,
  //                 upPool, downPool, upCount, downCount, upWins, losingPool,
  //                 settledAt, weightedUpPool, weightedDownPool, thresholdReachedAt }
  const round = rawRoundData as unknown as
    | {
        startTime: bigint;
        state: number;
        voteCount: bigint;
        revealedCount: bigint;
        totalStake: bigint;
        upPool: bigint; // revealed UP stake
        downPool: bigint; // revealed DOWN stake
        upCount: bigint; // revealed UP voter count
        downCount: bigint; // revealed DOWN voter count
        upWins: boolean;
      }
    | undefined;

  // Merge optimistic deltas (for immediate UI feedback after commitVote)
  const optimisticVoteCount = BigInt(optimistic?.voteCount ?? 0);
  const optimisticStake = optimistic?.stake ?? 0n;

  const baseVoteCount = round?.voteCount ?? 0n;
  const baseTotalStake = round?.totalStake ?? 0n;
  const state = round?.state ?? 0;

  // Pool data (only populated after votes are revealed by keeper)
  const upPool = round?.upPool ?? 0n;
  const downPool = round?.downPool ?? 0n;
  const upCount = round?.upCount ?? 0n;
  const downCount = round?.downCount ?? 0n;
  const revealedCount = Number(round?.revealedCount ?? 0n);

  const totalVoterCount = Number(baseVoteCount + optimisticVoteCount);
  const votersNeeded = Math.max(0, minVoters - totalVoterCount);
  const readyToSettle = state === 0 && totalVoterCount >= minVoters;
  const isRoundFull = totalVoterCount >= maxVoters;

  return {
    roundId,
    round: {
      state,
      startTime: round ? Number(round.startTime) : 0,
      voteCount: baseVoteCount + optimisticVoteCount,
      revealedCount,
      totalStake: baseTotalStake + optimisticStake,
      upPool,
      downPool,
      upCount,
      downCount,
      upWins: round?.upWins ?? false,
    },
    isLoading,
    votersNeeded,
    minVoters,
    maxVoters,
    isRoundFull,
    readyToSettle,
  };
}
