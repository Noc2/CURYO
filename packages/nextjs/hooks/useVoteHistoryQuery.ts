"use client";

import { useMemo } from "react";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { useScaffoldEventHistory } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderAvailability } from "~~/hooks/usePonderAvailability";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { type VoteHistoryItem, mapVoteHistoryItem } from "~~/hooks/voteHistory/shared";
import { ponderApi } from "~~/services/ponder/client";
import { publicEnv } from "~~/utils/env/public";

interface UseVoteHistoryQueryOptions {
  contentId?: bigint;
  enabled?: boolean;
  limit?: number;
}

function normalizeVoter(voter?: string) {
  return voter?.toLowerCase() ?? null;
}

export function getVoteHistoryQueryKey(voter?: string, chainId?: number) {
  return ["ponder-fallback", "voteHistory", chainId ?? null, normalizeVoter(voter)] as const;
}

type VoteHistoryEvent = {
  args?: {
    contentId?: bigint;
    roundId?: bigint;
    stake?: bigint;
  };
  blockData?: {
    timestamp?: bigint;
  };
};

function buildRoundStateMap(params: {
  settledEvents?: VoteHistoryEvent[];
  cancelledEvents?: VoteHistoryEvent[];
  tiedEvents?: VoteHistoryEvent[];
  revealFailedEvents?: VoteHistoryEvent[];
}) {
  const roundStateByKey = new Map<string, number>();
  const setState = (events: VoteHistoryEvent[] | undefined, roundState: number) => {
    for (const event of events ?? []) {
      const args = event.args;
      if (args?.contentId === undefined || args?.roundId === undefined) {
        continue;
      }

      roundStateByKey.set(`${args.contentId.toString()}-${args.roundId.toString()}`, roundState);
    }
  };

  setState(params.settledEvents, ROUND_STATE.Settled);
  setState(params.cancelledEvents, ROUND_STATE.Cancelled);
  setState(params.tiedEvents, ROUND_STATE.Tied);
  setState(params.revealFailedEvents, ROUND_STATE.RevealFailed);

  return roundStateByKey;
}

export function buildRpcVoteHistory(params: {
  commitEvents?: VoteHistoryEvent[];
  settledEvents?: VoteHistoryEvent[];
  cancelledEvents?: VoteHistoryEvent[];
  tiedEvents?: VoteHistoryEvent[];
  revealFailedEvents?: VoteHistoryEvent[];
}) {
  const roundStateByKey = buildRoundStateMap({
    settledEvents: params.settledEvents,
    cancelledEvents: params.cancelledEvents,
    tiedEvents: params.tiedEvents,
    revealFailedEvents: params.revealFailedEvents,
  });

  const votes: VoteHistoryItem[] = [];
  for (const event of params.commitEvents ?? []) {
    const args = event.args;
    if (args?.contentId === undefined || args?.roundId === undefined || args.stake === undefined) {
      continue;
    }

    const roundKey = `${args.contentId.toString()}-${args.roundId.toString()}`;
    const roundState = roundStateByKey.get(roundKey) ?? null;
    votes.push({
      contentId: args.contentId,
      roundId: args.roundId,
      stake: args.stake,
      roundState: roundState === null ? null : (roundState as VoteHistoryItem["roundState"]),
      isSettled: roundState !== null,
      claimType:
        roundState === ROUND_STATE.Settled
          ? "reward"
          : roundState === ROUND_STATE.Cancelled ||
              roundState === ROUND_STATE.Tied ||
              roundState === ROUND_STATE.RevealFailed
            ? "refund"
            : null,
      committedAt: event.blockData?.timestamp ? new Date(Number(event.blockData.timestamp) * 1000).toISOString() : null,
    });
  }

  return votes;
}

export function useVoteHistoryQuery(voter?: string, options: UseVoteHistoryQueryOptions = {}) {
  const { targetNetwork } = useTargetNetwork();
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const ponderAvailable = usePonderAvailability(rpcFallbackEnabled);
  const rpcFallbackActive = rpcFallbackEnabled && ponderAvailable === false;
  const isPageVisible = usePageVisibility();
  const contentId = options.contentId;
  const contentIdParam = contentId?.toString();
  const queryEnabled = options.enabled ?? true;
  const limit = options.limit && options.limit > 0 ? Math.floor(options.limit) : undefined;
  const normalizedVoter = normalizeVoter(voter) ?? undefined;
  const eventFilters = useMemo(() => (contentId === undefined ? { voter } : { voter, contentId }), [contentId, voter]);
  const eventsEnabled = queryEnabled && rpcFallbackActive && Boolean(normalizedVoter) && isPageVisible;

  const { data: commitEvents, isLoading: commitsLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "VoteCommitted",
    chainId: targetNetwork.id as any,
    blockData: true,
    filters: eventFilters,
    watch: eventsEnabled,
    enabled: eventsEnabled,
  } as any);

  const { data: settledEvents, isLoading: settledLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "RoundSettled",
    chainId: targetNetwork.id as any,
    watch: eventsEnabled,
    enabled: eventsEnabled,
  } as any);

  const { data: cancelledEvents } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "RoundCancelled",
    chainId: targetNetwork.id as any,
    watch: eventsEnabled,
    enabled: eventsEnabled,
  } as any);

  const { data: tiedEvents } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "RoundTied",
    chainId: targetNetwork.id as any,
    watch: eventsEnabled,
    enabled: eventsEnabled,
  } as any);

  const { data: revealFailedEvents } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "RoundRevealFailed",
    chainId: targetNetwork.id as any,
    watch: eventsEnabled,
    enabled: eventsEnabled,
  } as any);

  const rpcVotes = useMemo(() => {
    const votes = buildRpcVoteHistory({
      commitEvents,
      settledEvents,
      cancelledEvents,
      tiedEvents,
      revealFailedEvents,
    });
    if (contentId === undefined) return votes;
    return votes.filter(vote => vote.contentId === contentId);
  }, [cancelledEvents, commitEvents, contentId, revealFailedEvents, settledEvents, tiedEvents]);
  const rpcTotalVotes = rpcVotes.length;
  const rpcSettledTotal = useMemo(() => rpcVotes.filter(vote => vote.isSettled).length, [rpcVotes]);
  const rpcVisibleVotes = useMemo(() => (limit === undefined ? rpcVotes : rpcVotes.slice(0, limit)), [limit, rpcVotes]);

  const { data: result, isLoading } = usePonderQuery({
    queryKey: ["voteHistory", targetNetwork.id, normalizedVoter, contentIdParam ?? "all-content", limit ?? "all"],
    enabled: queryEnabled && Boolean(normalizedVoter),
    ponderFn: async () => {
      if (!normalizedVoter) {
        return {
          votes: [] as VoteHistoryItem[],
          total: 0,
          settledTotal: 0,
        };
      }

      if (limit !== undefined) {
        const response = await ponderApi.getVotesWindow({
          voter: normalizedVoter,
          contentId: contentIdParam,
          limit: String(limit),
        });
        const mappedVotes = response.items.map(mapVoteHistoryItem);
        return {
          votes: mappedVotes,
          total: response.total,
          settledTotal: mappedVotes.filter(vote => vote.isSettled).length,
        };
      }

      const votes = await ponderApi.getAllVotes({ voter: normalizedVoter, contentId: contentIdParam });
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
    refetchInterval: isPageVisible ? 30_000 : false,
  });

  return {
    votes: result?.data?.votes ?? rpcVisibleVotes,
    totalVotes: result?.data?.total ?? rpcTotalVotes,
    settledVoteCount: result?.data?.settledTotal ?? rpcSettledTotal,
    isLoading: isLoading || (rpcFallbackActive && (commitsLoading || settledLoading)),
  };
}
