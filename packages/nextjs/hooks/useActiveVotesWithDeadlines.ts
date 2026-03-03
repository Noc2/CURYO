"use client";

import { useEffect, useState } from "react";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

export interface ActiveVoteWithDeadline {
  contentId: string;
  roundId: string;
  stake: string;
  isUp: boolean | null; // null until revealed (tlock commit-reveal)
  revealed: boolean;
  epochIndex: number;
  startTime: number;
  epoch1EndTime: number; // when epoch 1 ends (full-weight voting window)
  deadline: number; // round expiry
  timeRemaining: number; // seconds until round expiry
  epoch1Remaining: number; // seconds until epoch 1 ends (0 if already ended)
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

  // Read config: [epochDuration, maxDuration, minVoters, maxVoters]
  const { data: rawConfig } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "config" as any,
    query: { refetchInterval: 60_000 },
  } as any);

  let epochDuration = 3600; // default 1 hour
  let maxDuration = 7 * 24 * 60 * 60; // default 7 days
  if (rawConfig) {
    const config = rawConfig as any;
    if (config.epochDuration != null) {
      epochDuration = Number(config.epochDuration);
      maxDuration = Number(config.maxDuration);
    } else if (Array.isArray(config)) {
      epochDuration = Number(config[0]); // epochDuration is index 0
      maxDuration = Number(config[1]); // maxDuration is index 1
    }
  }

  // Fetch active votes (state=0 means open rounds) — revealed=false means pending reveal
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

      // Epoch 1 ends at startTime + epochDuration
      const epoch1EndTime = startTime + epochDuration;
      const epoch1Remaining = Math.max(0, epoch1EndTime - now);

      // Round expiry: startTime + maxDuration
      const roundExpiry = startTime + maxDuration;
      const timeRemaining = Math.max(0, roundExpiry - now);

      return {
        contentId: v.contentId,
        roundId: v.roundId,
        stake: v.stake,
        isUp: v.isUp,
        revealed: v.revealed,
        epochIndex: v.epochIndex,
        startTime,
        epoch1EndTime,
        deadline: roundExpiry,
        timeRemaining,
        epoch1Remaining,
      };
    });

  let earliestDeadline: string | null = null;
  if (votes.length > 0) {
    // Show epoch1Remaining as the "next action" deadline, or round expiry if epoch 1 ended
    const nextDeadlines = votes.map(v => (v.epoch1Remaining > 0 ? v.epoch1Remaining : v.timeRemaining));
    const minRemaining = Math.min(...nextDeadlines);
    earliestDeadline = formatTimeRemaining(minRemaining);
  }

  return { votes, earliestDeadline, isLoading };
}

export { formatTimeRemaining };
