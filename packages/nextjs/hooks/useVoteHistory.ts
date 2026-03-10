"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

export interface VoteHistoryItem {
  contentId: bigint;
  roundId: bigint;
  stake: bigint;
  isSettled: boolean;
}

interface UseVoteHistoryOptions {
  pageSize?: number;
  paginated?: boolean;
}

function mapVoteHistoryItem(vote: {
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

export function useVoteHistory(voter?: string, options: UseVoteHistoryOptions = {}) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const paginated = options.paginated ?? false;
  const pageSize = options.pageSize ?? 50;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const queryLimit = paginated ? visibleCount : undefined;

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [pageSize, paginated, voter]);

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
  const rpcVisibleVotes = useMemo(
    () => (queryLimit === undefined ? rpcVotes : rpcVotes.slice(0, queryLimit)),
    [queryLimit, rpcVotes],
  );

  const { data: result, isLoading } = usePonderQuery({
    queryKey: ["voteHistory", voter, queryLimit ?? "all"],
    enabled: Boolean(voter),
    ponderFn: async () => {
      if (!voter) {
        return {
          votes: [] as VoteHistoryItem[],
          total: 0,
          settledTotal: 0,
        };
      }

      if (queryLimit !== undefined) {
        const response = await ponderApi.getVotesWindow({ voter, limit: String(queryLimit) });
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

  const votes = result?.data?.votes ?? rpcVisibleVotes;
  const totalVotes = result?.data?.total ?? rpcTotalVotes;
  const settledVoteCount = result?.data?.settledTotal ?? rpcSettledTotal;
  const hasMore = queryLimit !== undefined && totalVotes > votes.length;
  const loadMore = useCallback(() => {
    if (!paginated) return;
    setVisibleCount(prev => prev + pageSize);
  }, [pageSize, paginated]);

  return {
    votes,
    totalVotes,
    settledVoteCount,
    hasMore,
    loadMore,
    isLoading: isLoading || (rpcFallbackEnabled && (commitsLoading || settledLoading)),
  };
}
