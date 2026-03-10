"use client";

export interface VoteHistoryItem {
  contentId: bigint;
  roundId: bigint;
  stake: bigint;
  isSettled: boolean;
}

export function mapVoteHistoryItem(vote: {
  contentId: string;
  roundId: string;
  stake: string;
  roundState: number | null;
}): VoteHistoryItem {
  return {
    contentId: BigInt(vote.contentId),
    roundId: BigInt(vote.roundId),
    stake: BigInt(vote.stake),
    isSettled: vote.roundState === 1,
  };
}
