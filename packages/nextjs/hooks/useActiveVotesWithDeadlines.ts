"use client";

import { useEffect, useState } from "react";
import { useBlockNumber, usePublicClient } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

export interface ActiveVoteWithDeadline {
  contentId: string;
  roundId: string;
  stake: string;
  isUp: boolean;
  startTime: number;
  deadline: number;
  timeRemaining: number;
}

export interface ActiveVotesWithDeadlines {
  votes: ActiveVoteWithDeadline[];
  earliestDeadline: string | null;
  isLoading: boolean;
}

function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "expired";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function useActiveVotesWithDeadlines(voter?: string): ActiveVotesWithDeadlines {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  // Tick every second for countdown display
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Current block number for epoch deadline calculation
  const { data: currentBlock } = useBlockNumber({ watch: true });

  // Read config from contract (maxEpochBlocks for settlement, maxDuration for cancellation)
  const { data: rawConfig } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "config" as any,
    query: { refetchInterval: 60_000 },
  } as any);

  let maxEpochBlocks = 7200; // default ~24h at 12s blocks
  let maxDuration = 7 * 24 * 60 * 60; // default 7 days
  if (rawConfig) {
    const config = rawConfig as any;
    if (config.maxEpochBlocks != null) {
      maxEpochBlocks = Number(config.maxEpochBlocks);
      maxDuration = Number(config.maxDuration);
    } else if (Array.isArray(config)) {
      maxEpochBlocks = Number(config[1]); // maxEpochBlocks is index 1
      maxDuration = Number(config[2]); // maxDuration is index 2
    }
  }

  // Fetch active votes (state=0 means open rounds)
  const { data: ponderResult, isLoading } = usePonderQuery({
    queryKey: ["activeVotesWithDeadlines", voter],
    ponderFn: async () => {
      if (!voter) return { items: [] };
      return ponderApi.getVotes({ voter, state: "0", limit: "200" });
    },
    rpcFn: async () => ({ items: [] }),
    enabled: !!voter,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const items = ponderResult?.data?.items ?? [];
  const curBlock = currentBlock ? Number(currentBlock) : 0;

  const votes: ActiveVoteWithDeadline[] = items
    .filter(v => v.roundStartTime != null)
    .map(v => {
      const startTime = Number(v.roundStartTime);
      const startBlock = v.roundStartBlock ? Number(v.roundStartBlock) : 0;

      // Compute settlement deadline from epoch blocks (the actual settlement window)
      let epochTimeRemaining = Infinity;
      if (startBlock > 0 && curBlock > 0) {
        const epochDeadlineBlock = startBlock + maxEpochBlocks;
        const blocksRemaining = Math.max(0, epochDeadlineBlock - curBlock);
        // Estimate block time from this round's data
        const blocksElapsed = curBlock - startBlock;
        const timeElapsed = now - startTime;
        const avgBlockTime = blocksElapsed > 0 && timeElapsed > 0 ? timeElapsed / blocksElapsed : 12;
        epochTimeRemaining = blocksRemaining * avgBlockTime;
      }

      // Compute cancellation deadline from maxDuration (worst-case safety net)
      const durationTimeRemaining = Math.max(0, startTime + maxDuration - now);

      // Use the tighter of the two deadlines
      const timeRemaining = Math.max(0, Math.floor(Math.min(epochTimeRemaining, durationTimeRemaining)));
      const deadline = now + timeRemaining;

      return {
        contentId: v.contentId,
        roundId: v.roundId,
        stake: v.stake,
        isUp: v.isUp,
        startTime,
        deadline,
        timeRemaining,
      };
    });

  let earliestDeadline: string | null = null;
  if (votes.length > 0) {
    const minRemaining = Math.min(...votes.map(v => v.timeRemaining));
    earliestDeadline = formatTimeRemaining(minRemaining);
  }

  return { votes, earliestDeadline, isLoading };
}

export { formatTimeRemaining };
