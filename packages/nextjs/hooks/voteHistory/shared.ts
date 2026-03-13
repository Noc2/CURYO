"use client";

export interface VoteHistoryItem {
  contentId: bigint;
  roundId: bigint;
  stake: bigint;
  isSettled: boolean;
  committedAt: string | null;
}

export function mapVoteHistoryItem(vote: {
  contentId: string;
  roundId: string;
  stake: string;
  roundState: number | null;
  committedAt?: string | null;
}): VoteHistoryItem {
  return {
    contentId: BigInt(vote.contentId),
    roundId: BigInt(vote.roundId),
    stake: BigInt(vote.stake),
    isSettled: vote.roundState === 1,
    committedAt: vote.committedAt ?? null,
  };
}
