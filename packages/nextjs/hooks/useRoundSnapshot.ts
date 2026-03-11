"use client";

import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { useUnixTime } from "~~/hooks/useUnixTime";
import { useVotingConfig } from "~~/hooks/useVotingConfig";
import { deriveRoundSnapshot, parseRound } from "~~/lib/contracts/roundVotingEngine";

export function useRoundSnapshot(contentId?: bigint) {
  const { getOptimisticDelta } = useOptimisticVote();
  const optimisticDelta = contentId !== undefined ? getOptimisticDelta(contentId) : undefined;
  const config = useVotingConfig();
  const now = useUnixTime();
  const isPageVisible = usePageVisibility();
  const refetchInterval = isPageVisible ? 10_000 : false;

  const { data: rawActiveRoundId, isLoading: isRoundIdLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getActiveRoundId" as any,
    args: [contentId] as any,
    watch: true,
    query: {
      enabled: contentId !== undefined,
      refetchInterval,
    },
  } as any);
  const roundId = (rawActiveRoundId as unknown as bigint | undefined) ?? 0n;

  const { data: rawRoundData, isLoading: isRoundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getRound" as any,
    args: [contentId, roundId] as any,
    watch: true,
    query: {
      enabled: contentId !== undefined && roundId > 0n,
      refetchInterval,
    },
  } as any);

  const snapshot = deriveRoundSnapshot({
    roundId,
    round: parseRound(rawRoundData),
    config,
    optimisticDelta,
    now,
  });

  return {
    ...snapshot,
    isLoading: contentId !== undefined && (isRoundIdLoading || (roundId > 0n && isRoundLoading)),
    isReady: contentId !== undefined && !isRoundIdLoading && !isRoundLoading,
  };
}

export type RoundSnapshot = ReturnType<typeof useRoundSnapshot>;
