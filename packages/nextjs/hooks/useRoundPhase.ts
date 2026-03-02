"use client";

import { useEffect, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";
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
  /** Seconds remaining before settlement deadline (epoch blocks) or round expiry (maxDuration), whichever is sooner */
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

  // Current block number for epoch deadline calculation
  const { data: currentBlock } = useBlockNumber({ watch: true });

  // Read config for minVoters, maxVoters, maxDuration, maxEpochBlocks
  const [configMinVoters, setConfigMinVoters] = useState(3);
  const [configMaxVoters, setConfigMaxVoters] = useState(1000);
  const [configMaxDuration, setConfigMaxDuration] = useState(7 * 24 * 60 * 60); // default 1 week
  const [configMaxEpochBlocks, setConfigMaxEpochBlocks] = useState(7200); // default ~24h at 12s

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
        if (data.maxDuration != null) {
          setConfigMaxEpochBlocks(Number(data.maxEpochBlocks));
          setConfigMaxDuration(Number(data.maxDuration));
          setConfigMinVoters(Number(data.minVoters));
          setConfigMaxVoters(Number(data.maxVoters));
        } else {
          // Positional tuple fallback
          const config = data as any[];
          setConfigMaxEpochBlocks(Number(config[1])); // maxEpochBlocks
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
    startBlock: bigint;
    state: number;
    voteCount: bigint;
    totalStake: bigint;
  };

  const voteCount = Number(round.voteCount);
  const totalStake = round.totalStake;
  const startTime = Number(round.startTime);
  const startBlock = Number(round.startBlock);
  const votersNeeded = Math.max(0, configMinVoters - voteCount);

  // Compute settlement deadline from epoch blocks (the actual settlement window)
  const curBlock = currentBlock ? Number(currentBlock) : 0;
  let epochTimeRemaining = Infinity;
  if (startBlock > 0 && curBlock > 0) {
    const epochDeadlineBlock = startBlock + configMaxEpochBlocks;
    const blocksRemaining = Math.max(0, epochDeadlineBlock - curBlock);
    const blocksElapsed = curBlock - startBlock;
    const timeElapsed = now - startTime;
    const avgBlockTime = blocksElapsed > 0 && timeElapsed > 0 ? timeElapsed / blocksElapsed : 12;
    epochTimeRemaining = blocksRemaining * avgBlockTime;
  }

  // Compute cancellation deadline from maxDuration (worst-case safety net)
  const durationTimeRemaining = Math.max(0, startTime + configMaxDuration - now);

  // Use the tighter of the two deadlines
  const roundTimeRemaining = Math.max(0, Math.floor(Math.min(epochTimeRemaining, durationTimeRemaining)));

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
