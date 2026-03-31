"use client";

import { ROUND_STATE, type RoundState } from "@curyo/contracts/protocol";

export interface VoteHistoryItem {
  contentId: bigint;
  roundId: bigint;
  stake: bigint;
  isSettled: boolean;
  roundState?: RoundState | null;
  claimType?: "reward" | "refund" | null;
  committedAt: string | null;
}

export function getVoteClaimType(roundState: RoundState | null | undefined) {
  if (roundState === ROUND_STATE.Settled) {
    return "reward" as const;
  }

  if (
    roundState === ROUND_STATE.Cancelled ||
    roundState === ROUND_STATE.Tied ||
    roundState === ROUND_STATE.RevealFailed
  ) {
    return "refund" as const;
  }

  return null;
}

export function mapVoteHistoryItem(vote: {
  contentId: string;
  roundId: string;
  stake: string;
  roundState: number | null;
  committedAt?: string | null;
}): VoteHistoryItem {
  const claimType = getVoteClaimType(vote.roundState as RoundState | null);

  return {
    contentId: BigInt(vote.contentId),
    roundId: BigInt(vote.roundId),
    stake: BigInt(vote.stake),
    isSettled: claimType !== null,
    roundState: vote.roundState as RoundState | null,
    claimType,
    committedAt: vote.committedAt ?? null,
  };
}
