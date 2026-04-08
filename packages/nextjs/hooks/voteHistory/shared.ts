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

function getCommittedAtTimestamp(vote: VoteHistoryItem) {
  if (!vote.committedAt) return 0;
  const parsed = Date.parse(vote.committedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mergeVoteHistoryItems(voteLists: VoteHistoryItem[][]): VoteHistoryItem[] {
  const merged = new Map<string, VoteHistoryItem>();

  for (const votes of voteLists) {
    for (const vote of votes) {
      const key = `${vote.contentId.toString()}-${vote.roundId.toString()}-${vote.stake.toString()}-${vote.committedAt ?? ""}`;
      if (!merged.has(key)) {
        merged.set(key, vote);
      }
    }
  }

  return Array.from(merged.values()).sort((left, right) => {
    const committedAtDiff = getCommittedAtTimestamp(right) - getCommittedAtTimestamp(left);
    if (committedAtDiff !== 0) return committedAtDiff;
    if (left.contentId !== right.contentId) return left.contentId > right.contentId ? -1 : 1;
    if (left.roundId !== right.roundId) return left.roundId > right.roundId ? -1 : 1;
    if (left.stake !== right.stake) return left.stake > right.stake ? -1 : 1;
    return 0;
  });
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
