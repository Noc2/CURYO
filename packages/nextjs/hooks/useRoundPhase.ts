"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export type RoundPhase = "voting" | "settled" | "cancelled" | "tied" | "none";

export interface RoundPhaseInfo {
  /** Current phase of the round for this content */
  phase: RoundPhase;
  /** Active round ID for this content (0 if none) */
  roundId: bigint;
  /** Number of vote commits cast so far */
  voteCount: number;
  /** Number of votes that have been revealed (direction known) */
  revealedCount: number;
  /** Total stake committed in this round (raw, 6 decimals) */
  totalStake: bigint;
  /** How many more voters needed to reach minVoters (0 if already met) */
  votersNeeded: number;
  /** Seconds remaining until round expiry (maxDuration from startTime) */
  roundTimeRemaining: number;
  /** Seconds remaining in epoch 1 (0 if epoch 1 has ended) */
  epoch1Remaining: number;
  /** Whether we are still in epoch 1 (blind voting, full reward weight) */
  isEpoch1: boolean;
  /** Unix timestamp when epoch 1 ends for this round */
  epoch1EndTime: number;
  /** Epoch duration in seconds (from contract config) */
  epochDuration: number;
  /** Unix timestamp when the round started */
  startTime: number;
  /** Minimum voters required for settlement */
  minVoters: number;
  /** Maximum voters allowed per round */
  maxVoters: number;
  /** Whether contract data has loaded */
  isReady: boolean;
}

/**
 * Per-content round state tracking for tlock commit-reveal voting.
 * Reads from RoundVotingEngine: getActiveRoundId(contentId) and getRound(contentId, roundId).
 * Polls every 5 seconds for updates and ticks locally every second for countdowns.
 *
 * Epoch 1 (blind) = first epochDuration seconds after round start — full reward weight (100%)
 * Epoch 2+ (informed) = after epoch 1 ends — reduced reward weight (25%)
 */
export function useRoundPhase(contentId?: bigint): RoundPhaseInfo {
  const publicClient = usePublicClient();
  const { data: votingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" } as any);

  // Get the active round ID for this content
  const { data: rawActiveRoundId, isLoading: roundIdLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getActiveRoundId" as any,
    args: [contentId] as any,
    query: {
      enabled: contentId !== undefined,
      refetchInterval: 5000,
    },
  } as any);
  const activeRoundId = rawActiveRoundId as unknown as bigint | undefined;

  // Get the round data
  const { data: rawRoundData, isLoading: roundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getRound" as any,
    args: [contentId, activeRoundId] as any,
    query: {
      enabled: contentId !== undefined && activeRoundId !== undefined && activeRoundId > 0n,
      refetchInterval: 5000,
    },
  } as any);

  // Read config: [epochDuration, maxDuration, minVoters, maxVoters]
  const [configEpochDuration, setConfigEpochDuration] = useState(3600); // default 1 hour
  const [configMaxDuration, setConfigMaxDuration] = useState(7 * 24 * 60 * 60); // default 1 week
  const [configMinVoters, setConfigMinVoters] = useState(3);
  const [configMaxVoters, setConfigMaxVoters] = useState(1000);

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
        // RoundConfig struct: { epochDuration, maxDuration, minVoters, maxVoters }
        if (data.epochDuration != null) {
          setConfigEpochDuration(Number(data.epochDuration));
          setConfigMaxDuration(Number(data.maxDuration));
          setConfigMinVoters(Number(data.minVoters));
          setConfigMaxVoters(Number(data.maxVoters));
        } else if (Array.isArray(data) && data.length >= 4) {
          // Positional tuple fallback
          setConfigEpochDuration(Number(data[0])); // epochDuration
          setConfigMaxDuration(Number(data[1])); // maxDuration
          setConfigMinVoters(Number(data[2])); // minVoters
          setConfigMaxVoters(Number(data[3])); // maxVoters
        }
      })
      .catch(() => {
        // Fall back to defaults
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, votingEngineInfo]);

  // Local clock for countdown (ticks every second)
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const roundId = activeRoundId ?? 0n;
  const isReady = !roundIdLoading && !roundLoading && contentId !== undefined;

  const defaultResult: RoundPhaseInfo = {
    phase: "none",
    roundId: 0n,
    voteCount: 0,
    revealedCount: 0,
    totalStake: 0n,
    votersNeeded: 0,
    roundTimeRemaining: 0,
    epoch1Remaining: 0,
    isEpoch1: false,
    epoch1EndTime: 0,
    epochDuration: configEpochDuration,
    startTime: 0,
    minVoters: configMinVoters,
    maxVoters: configMaxVoters,
    isReady,
  };

  if (!rawRoundData || roundId === 0n) {
    return defaultResult;
  }

  // Parse round data from contract
  // Round struct: { startTime, state, voteCount, revealedCount, totalStake, upPool, downPool,
  //                 upCount, downCount, upWins, losingPool, settledAt, weightedUpPool, weightedDownPool,
  //                 thresholdReachedAt }
  const round = rawRoundData as unknown as {
    startTime: bigint;
    state: number;
    voteCount: bigint;
    revealedCount: bigint;
    totalStake: bigint;
  };

  const voteCount = Number(round.voteCount);
  const revealedCount = Number(round.revealedCount ?? 0n);
  const totalStake = round.totalStake;
  const startTime = Number(round.startTime);
  const votersNeeded = Math.max(0, configMinVoters - voteCount);

  // Epoch 1 ends at startTime + epochDuration
  const epoch1EndTime = startTime + configEpochDuration;
  const isEpoch1 = now < epoch1EndTime;
  const epoch1Remaining = Math.max(0, epoch1EndTime - now);

  // Round expiry: startTime + maxDuration
  const roundTimeRemaining = Math.max(0, startTime + configMaxDuration - now);

  // Determine phase from contract state
  // Round states: Open (0), Settled (1), Cancelled (2), Tied (3)
  let phase: RoundPhase;

  switch (round.state) {
    case 0:
      phase = "voting";
      break;
    case 1:
      phase = "settled";
      break;
    case 2:
      phase = "cancelled";
      break;
    case 3:
      phase = "tied";
      break;
    default:
      phase = "none";
  }

  return {
    phase,
    roundId,
    voteCount,
    revealedCount,
    totalStake,
    votersNeeded,
    roundTimeRemaining,
    epoch1Remaining,
    isEpoch1,
    epoch1EndTime,
    epochDuration: configEpochDuration,
    startTime,
    minVoters: configMinVoters,
    maxVoters: configMaxVoters,
    isReady,
  };
}
