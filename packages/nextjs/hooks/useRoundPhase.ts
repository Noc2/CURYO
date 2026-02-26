"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export type RoundPhase = "open" | "settled" | "cancelled" | "tied" | "none";

export interface RoundPhaseInfo {
  /** Current phase of the round for this content */
  phase: RoundPhase;
  /** Active round ID for this content (0 if none) */
  roundId: bigint;
  /** Number of votes committed so far */
  voteCount: number;
  /** Number of votes revealed so far */
  revealedCount: number;
  /** Total stake committed in this round (raw, 6 decimals) */
  totalStake: bigint;
  /** How many more revealed voters needed to reach minVoters (0 if already met) */
  votersNeeded: number;
  /** Seconds remaining in the current epoch (15-min window) */
  epochTimeRemaining: number;
  /** Seconds remaining before the round expires (1-week lifetime) */
  roundTimeRemaining: number;
  /** Unix timestamp when the current epoch ends */
  epochEnd: number;
  /** Unix timestamp when the round started */
  startTime: number;
  /** Epoch duration in seconds (from contract config) */
  epochDuration: number;
  /** Minimum voters required for settlement */
  minVoters: number;
  /** Maximum voters allowed per round */
  maxVoters: number;
  /** Whether contract data has loaded */
  isReady: boolean;
}

/**
 * Per-content round state tracking for tlock-primary voting.
 * Reads from RoundVotingEngine: getActiveRoundId(contentId) and getRound(contentId, roundId).
 * Computes epoch timing locally from round startTime and config epochDuration.
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

  // Read config for epochDuration and minVoters
  const [configEpochDuration, setConfigEpochDuration] = useState(900); // default 15 min
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
        const config = data as [bigint, bigint, bigint, bigint];
        setConfigEpochDuration(Number(config[0])); // epochDuration
        setConfigMaxDuration(Number(config[1])); // maxDuration
        setConfigMinVoters(Number(config[2])); // minVoters
        setConfigMaxVoters(Number(config[3])); // maxVoters
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
    epochTimeRemaining: 0,
    roundTimeRemaining: 0,
    epochEnd: 0,
    startTime: 0,
    epochDuration: configEpochDuration,
    minVoters: configMinVoters,
    maxVoters: configMaxVoters,
    isReady,
  };

  // No active round
  if (!rawRoundData || roundId === 0n) {
    return defaultResult;
  }

  // Parse round data from contract
  // New struct: { startTime, state, voteCount, revealedCount, totalStake, upPool, downPool, upCount, downCount, upWins }
  const round = rawRoundData as unknown as {
    startTime: bigint;
    state: number;
    voteCount: bigint;
    revealedCount: bigint;
    totalStake: bigint;
  };

  const voteCount = Number(round.voteCount);
  const revealedCount = Number(round.revealedCount);
  const totalStake = round.totalStake;
  const startTime = Number(round.startTime);
  const votersNeeded = Math.max(0, configMinVoters - revealedCount);

  // Compute epoch timing
  const epochIndex = startTime > 0 ? Math.floor((now - startTime) / configEpochDuration) : 0;
  const epochEnd = startTime > 0 ? startTime + (epochIndex + 1) * configEpochDuration : 0;
  const epochTimeRemaining = Math.max(0, epochEnd - now);

  // Round lifetime: expires after maxDuration from startTime
  const roundExpiry = startTime + configMaxDuration;
  const roundTimeRemaining = Math.max(0, roundExpiry - now);

  // Determine phase from contract state
  // Round states: Open (0), Settled (1), Cancelled (2), Tied (3)
  let phase: RoundPhase;

  switch (round.state) {
    case 0: // Open
      phase = "open";
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
    revealedCount,
    totalStake,
    votersNeeded,
    epochTimeRemaining,
    roundTimeRemaining,
    epochEnd,
    startTime,
    epochDuration: configEpochDuration,
    minVoters: configMinVoters,
    maxVoters: configMaxVoters,
    isReady,
  };
}
