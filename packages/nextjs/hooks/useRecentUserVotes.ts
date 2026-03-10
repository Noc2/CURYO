"use client";

import { useMemo } from "react";
import { usePonderQuery } from "./usePonderQuery";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { QueryClient } from "@tanstack/react-query";
import { type PonderVoteItem, ponderApi } from "~~/services/ponder/client";

export function getRecentUserVotesQueryKey(voter?: string) {
  return ["ponder-fallback", "recentUserVotes", voter] as const;
}

export function invalidateRecentUserVotes(queryClient: QueryClient, voter?: string) {
  return queryClient.invalidateQueries({ queryKey: getRecentUserVotesQueryKey(voter) });
}

export function useRecentUserVotes(voter?: string) {
  const {
    data: result,
    isLoading,
    refetch,
  } = usePonderQuery({
    queryKey: ["recentUserVotes", voter],
    ponderFn: async () => {
      if (!voter) return [] as PonderVoteItem[];
      return ponderApi.getAllVotes({ voter });
    },
    rpcFn: async () => [] as PonderVoteItem[],
    enabled: !!voter,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const votes = useMemo(() => result?.data ?? [], [result?.data]);
  const openVotes = useMemo(() => votes.filter(vote => vote.roundState === ROUND_STATE.Open), [votes]);

  return {
    votes,
    openVotes,
    isLoading,
    refetch,
  };
}
