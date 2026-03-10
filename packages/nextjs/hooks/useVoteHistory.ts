"use client";

import { useVoteHistoryQuery } from "~~/hooks/useVoteHistoryQuery";

export type { VoteHistoryItem } from "~~/hooks/voteHistory/shared";

export function useVoteHistory(voter?: string) {
  return useVoteHistoryQuery(voter);
}
