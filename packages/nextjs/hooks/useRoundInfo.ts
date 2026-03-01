"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Hook to read round state for a content item.
 * All vote stats (direction, pools) are public in real-time.
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
        if (data.minVoters != null) {
          setMinVoters(Number(data.minVoters));
          setMaxVoters(Number(data.maxVoters));
        } else {
          const config = data as any[];
          setMinVoters(Number(config[3])); // minVoters
          setMaxVoters(Number(config[4])); // maxVoters
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
  // Round struct: { startTime, startBlock, state, voteCount, totalStake, totalUpStake, totalDownStake,
  //                 totalUpShares, totalDownShares, upCount, downCount, upWins, settledAt, epochStartRating }
  const round = rawRoundData as unknown as
    | {
        startTime: bigint;
        state: number;
        voteCount: bigint;
        totalStake: bigint;
        totalUpStake: bigint;
        totalDownStake: bigint;
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

  // Pool data (all public in real-time)
  const upStake = round?.totalUpStake ?? 0n;
  const downStake = round?.totalDownStake ?? 0n;
  const upCount = round?.upCount ?? 0n;
  const downCount = round?.downCount ?? 0n;

  // Settlement readiness: need at least minVoters votes
  const totalVoterCount = Number(baseVoteCount + optimisticVoteCount);
  const votersNeeded = Math.max(0, minVoters - totalVoterCount);
  const readyToSettle = state === 0 && totalVoterCount >= minVoters;

  // Round capacity: is the round full?
  const isRoundFull = totalVoterCount >= maxVoters;

  return {
    roundId,
    round: {
      state,
      startTime: round ? Number(round.startTime) : 0,
      voteCount: baseVoteCount + optimisticVoteCount,
      totalStake: baseTotalStake + optimisticStake,
      // Public pool breakdown (visible in real-time)
      upStake,
      downStake,
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
