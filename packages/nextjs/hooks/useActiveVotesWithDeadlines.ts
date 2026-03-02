"use client";

import { useEffect, useState } from "react";
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

  // Read config.maxDuration from contract
  const { data: rawConfig } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "config" as any,
    query: { refetchInterval: 60_000 },
  } as any);

  let maxDuration = 7 * 24 * 60 * 60; // default 7 days
  if (rawConfig) {
    const config = rawConfig as any;
    if (config.maxDuration != null) {
      maxDuration = Number(config.maxDuration);
    } else if (Array.isArray(config)) {
      maxDuration = Number(config[2]);
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

  const votes: ActiveVoteWithDeadline[] = items
    .filter(v => v.roundStartTime != null)
    .map(v => {
      const startTime = Number(v.roundStartTime);
      const deadline = startTime + maxDuration;
      const timeRemaining = Math.max(0, deadline - now);
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
