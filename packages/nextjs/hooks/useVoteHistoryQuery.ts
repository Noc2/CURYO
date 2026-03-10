"use client";

import { useMemo } from "react";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { type VoteHistoryItem, mapVoteHistoryItem } from "~~/hooks/voteHistory/shared";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

interface UseVoteHistoryQueryOptions {
  limit?: number;
}

export function useVoteHistoryQuery(voter?: string, options: UseVoteHistoryQueryOptions = {}) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;

  const { data: commitEvents, isLoading: commitsLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "VoteCommitted",
    filters: { voter },
    watch: rpcFallbackEnabled,
    enabled: rpcFallbackEnabled && Boolean(voter),
  } as any);

  const { data: settledEvents, isLoading: settledLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "RoundSettled",
    watch: rpcFallbackEnabled,
    enabled: rpcFallbackEnabled && Boolean(voter),
  } as any);

  const rpcVotes = useMemo(() => {
    const settledRoundKeys = new Set(
      settledEvents
        ?.map(event => {
          const args = event.args as { contentId?: bigint; roundId?: bigint } | undefined;
          if (!args || args.contentId === undefined || args.roundId === undefined) return null;
          return `${args.contentId.toString()}-${args.roundId.toString()}`;
        })
        .filter((key): key is string => Boolean(key)) ?? [],
    );

    return (
      commitEvents
        ?.map(event => {
          const args = event.args as { contentId?: bigint; roundId?: bigint; stake?: bigint } | undefined;
          if (!args || args.contentId === undefined || args.roundId === undefined || args.stake === undefined) {
            return null;
          }

          const roundKey = `${args.contentId.toString()}-${args.roundId.toString()}`;
          return {
            contentId: args.contentId,
            roundId: args.roundId,
            stake: args.stake,
            isSettled: settledRoundKeys.has(roundKey),
          } satisfies VoteHistoryItem;
        })
        .filter((item): item is VoteHistoryItem => item !== null) ?? []
    );
  }, [commitEvents, settledEvents]);
  const rpcTotalVotes = rpcVotes.length;
  const rpcSettledTotal = useMemo(() => rpcVotes.filter(vote => vote.isSettled).length, [rpcVotes]);
  const rpcVisibleVotes = useMemo(() => (limit === undefined ? rpcVotes : rpcVotes.slice(0, limit)), [limit, rpcVotes]);

  const { data: result, isLoading } = usePonderQuery({
    queryKey: ["voteHistory", voter, limit ?? "all"],
    enabled: Boolean(voter),
    ponderFn: async () => {
      if (!voter) {
        return {
          votes: [] as VoteHistoryItem[],
          total: 0,
          settledTotal: 0,
        };
      }

      if (limit !== undefined) {
        const response = await ponderApi.getVotesWindow({ voter, limit: String(limit) });
        return {
          votes: response.items.map(mapVoteHistoryItem),
          total: response.total,
          settledTotal: response.settledTotal,
        };
      }

      const votes = await ponderApi.getAllVotes({ voter });
      const mappedVotes = votes.map(mapVoteHistoryItem);
      return {
        votes: mappedVotes,
        total: mappedVotes.length,
        settledTotal: mappedVotes.filter(vote => vote.isSettled).length,
      };
    },
    rpcFn: async () => ({
      votes: rpcVisibleVotes,
      total: rpcTotalVotes,
      settledTotal: rpcSettledTotal,
    }),
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    votes: result?.data?.votes ?? rpcVisibleVotes,
    totalVotes: result?.data?.total ?? rpcTotalVotes,
    settledVoteCount: result?.data?.settledTotal ?? rpcSettledTotal,
    isLoading: isLoading || (rpcFallbackEnabled && (commitsLoading || settledLoading)),
  };
}
