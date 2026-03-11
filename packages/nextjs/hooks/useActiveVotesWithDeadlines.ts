"use client";

import { useRecentUserVotes } from "~~/hooks/useRecentUserVotes";
import { useUnixTime } from "~~/hooks/useUnixTime";
import { useVotingConfig } from "~~/hooks/useVotingConfig";
import { deriveVoteDeadlines } from "~~/lib/contracts/roundVotingEngine";

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
  /** Formatted time until the earliest unrevealed vote's epoch 1 ends (i.e. when it gets revealed). */
  earliestReveal: string | null;
  /** True when at least one unrevealed vote has already passed its epoch-1 window (keeper reveal pending). */
  hasPendingReveals: boolean;
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
  const now = useUnixTime();
  const { epochDuration, maxDuration } = useVotingConfig();
  const { openVotes, isLoading } = useRecentUserVotes(voter);

  const votes: ActiveVoteWithDeadline[] = openVotes
    .filter(v => v.roundStartTime != null)
    .map(v => {
      const startTime = Number(v.roundStartTime);
      const deadlines = deriveVoteDeadlines({
        startTime,
        now,
        epochDuration,
        maxDuration,
      });

      return {
        contentId: v.contentId,
        roundId: v.roundId,
        stake: v.stake,
        isUp: v.isUp,
        revealed: v.revealed,
        epochIndex: v.epochIndex,
        startTime,
        epoch1EndTime: deadlines.epoch1EndTime,
        deadline: deadlines.deadline,
        timeRemaining: deadlines.roundTimeRemaining,
        epoch1Remaining: deadlines.epoch1Remaining,
      };
    });

  let earliestDeadline: string | null = null;
  if (votes.length > 0) {
    // Show epoch1Remaining as the "next action" deadline, or round expiry if epoch 1 ended
    const nextDeadlines = votes.map(v => (v.epoch1Remaining > 0 ? v.epoch1Remaining : v.timeRemaining));
    const minRemaining = Math.min(...nextDeadlines);
    earliestDeadline = formatTimeRemaining(minRemaining);
  }

  // Reveal-specific countdown: epoch-1 end time for unrevealed votes
  let earliestReveal: string | null = null;
  let hasPendingReveals = false;
  const unrevealedVotes = votes.filter(v => !v.revealed);
  if (unrevealedVotes.length > 0) {
    const stillInEpoch1 = unrevealedVotes.filter(v => v.epoch1Remaining > 0);
    if (stillInEpoch1.length > 0) {
      const minEpoch1Remaining = Math.min(...stillInEpoch1.map(v => v.epoch1Remaining));
      earliestReveal = formatTimeRemaining(minEpoch1Remaining);
    }
    hasPendingReveals = unrevealedVotes.some(v => v.epoch1Remaining === 0);
  }

  return { votes, earliestDeadline, earliestReveal, hasPendingReveals, isLoading };
}

export { formatTimeRemaining };
