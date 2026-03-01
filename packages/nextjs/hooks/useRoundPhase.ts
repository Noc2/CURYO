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
  /** Number of votes cast so far */
  voteCount: number;
  /** Total stake in this round (raw, 6 decimals) */
  totalStake: bigint;
  /** How many more voters needed to reach minVoters (0 if already met) */
  votersNeeded: number;
  /** Seconds remaining before the round expires (maxDuration lifetime) */
  roundTimeRemaining: number;
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
 * Per-content round state tracking for public voting with random settlement.
 * Reads from RoundVotingEngine: getActiveRoundId(contentId) and getRound(contentId, roundId).
 * Polls every 5 seconds for updates and ticks locally every second for countdowns.
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

  // Read config for minVoters, maxVoters, maxDuration
  const [configMinVoters, setConfigMinVoters] = useState(3);
  const [configMaxVoters, setConfigMaxVoters] = useState(1000);
  const [configMaxDuration, setConfigMaxDuration] = useState(7 * 24 * 60 * 60); // default 1 week

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
        // RoundConfig struct fields: minEpochBlocks, maxEpochBlocks, maxDuration, minVoters, maxVoters, ...
        // The public getter returns a tuple. We need maxDuration, minVoters, maxVoters.
        if (data.maxDuration != null) {
          setConfigMaxDuration(Number(data.maxDuration));
          setConfigMinVoters(Number(data.minVoters));
          setConfigMaxVoters(Number(data.maxVoters));
        } else {
          // Positional tuple fallback
          const config = data as any[];
          setConfigMaxDuration(Number(config[2])); // maxDuration
          setConfigMinVoters(Number(config[3])); // minVoters
          setConfigMaxVoters(Number(config[4])); // maxVoters
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
    totalStake: 0n,
    votersNeeded: 0,
    roundTimeRemaining: 0,
    startTime: 0,
    minVoters: configMinVoters,
    maxVoters: configMaxVoters,
    isReady,
  };

  // No active round
  if (!rawRoundData || roundId === 0n) {
    return defaultResult;
  }

  // Parse round data from contract
  const round = rawRoundData as unknown as {
    startTime: bigint;
    state: number;
    voteCount: bigint;
    totalStake: bigint;
  };

  const voteCount = Number(round.voteCount);
  const totalStake = round.totalStake;
  const startTime = Number(round.startTime);
  const votersNeeded = Math.max(0, configMinVoters - voteCount);

  // Round lifetime: expires after maxDuration from startTime
  const roundExpiry = startTime + configMaxDuration;
  const roundTimeRemaining = Math.max(0, roundExpiry - now);

  // Determine phase from contract state
  // Round states: Open (0), Settled (1), Cancelled (2), Tied (3)
  let phase: RoundPhase;

  switch (round.state) {
    case 0: // Open
      phase = "voting";
      break;
    case 1: // Settled
      phase = "settled";
      break;
    case 2: // Cancelled
      phase = "cancelled";
      break;
    case 3: // Tied
      phase = "tied";
      break;
    default:
      phase = "none";
  }

  return {
    phase,
    roundId,
    voteCount,
    totalStake,
    votersNeeded,
    roundTimeRemaining,
    startTime,
    minVoters: configMinVoters,
    maxVoters: configMaxVoters,
    isReady,
  };
}
