"use client";

import { useMemo } from "react";
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

export function useVoteHistory(voter?: string) {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;

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

  const { data: result, isLoading } = usePonderQuery({
    queryKey: ["voteHistory", voter],
    enabled: Boolean(voter),
    ponderFn: async () => {
      if (!voter) return [];

      const votes = await ponderApi.getAllVotes({ voter });
      return votes.map(vote => ({
        contentId: BigInt(vote.contentId),
        roundId: BigInt(vote.roundId),
        stake: BigInt(vote.stake),
        isSettled: vote.roundState === 1,
      })) satisfies VoteHistoryItem[];
    },
    rpcFn: async () => rpcVotes,
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  return {
    votes: result?.data ?? rpcVotes,
    isLoading: isLoading || (rpcFallbackEnabled && (commitsLoading || settledLoading)),
  };
}
