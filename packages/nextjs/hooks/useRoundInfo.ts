"use client";

import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";

/**
 * Hook to read round state for a content item.
 * tlock commit-reveal: vote directions are hidden until epoch ends and keeper reveals them.
 * Returns optimistic vote deltas for instant UI updates after commitVote.
 */
export function useRoundInfo(contentId?: bigint) {
  const snapshot = useRoundSnapshot(contentId);

  return {
    roundId: snapshot.roundId,
    round: snapshot.round,
    isLoading: snapshot.isLoading,
    votersNeeded: snapshot.votersNeeded,
    minVoters: snapshot.minVoters,
    maxVoters: snapshot.maxVoters,
    isRoundFull: snapshot.isRoundFull,
    readyToSettle: snapshot.readyToSettle,
  };
}
