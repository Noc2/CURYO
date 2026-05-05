"use client";

import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { useUnixTime } from "~~/hooks/useUnixTime";
import { useVotingConfig } from "~~/hooks/useVotingConfig";
import {
  type OpenRoundFallbackData,
  type VotingConfig,
  deriveRoundSnapshot,
  mergeRoundDataWithFallback,
  parseRound,
  parseVotingConfig,
} from "~~/lib/contracts/roundVotingEngine";

export function useRoundSnapshot(
  contentId?: bigint,
  fallbackOpenRound?: OpenRoundFallbackData,
  fallbackRoundConfig?: VotingConfig | null,
) {
  const { getOptimisticDelta } = useOptimisticVote();
  const optimisticDelta = contentId !== undefined ? getOptimisticDelta(contentId) : undefined;
  const protocolConfig = useVotingConfig();
  const now = useUnixTime();
  const isPageVisible = usePageVisibility();
  const refetchInterval = isPageVisible ? 10_000 : false;

  const { data: rawCurrentRoundId, isLoading: isRoundIdLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "currentRoundId" as any,
    args: [contentId] as any,
    watch: true,
    query: {
      enabled: contentId !== undefined,
      refetchInterval,
    },
  } as any);
  const currentRoundId = (rawCurrentRoundId as unknown as bigint | undefined) ?? 0n;

  const { data: rawRoundData, isLoading: isRoundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "rounds" as any,
    args: [contentId, currentRoundId] as any,
    watch: true,
    query: {
      enabled: contentId !== undefined && currentRoundId > 0n,
      refetchInterval,
    },
  } as any);

  const { data: rawRoundConfigSnapshot, isLoading: isRoundConfigLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "roundConfigSnapshot" as any,
    args: [contentId, currentRoundId] as any,
    watch: true,
    query: {
      enabled: contentId !== undefined && currentRoundId > 0n,
      refetchInterval,
    },
  } as any);

  const parsedRound = parseRound(rawRoundData);
  const mergedRound = mergeRoundDataWithFallback({
    roundId: currentRoundId,
    round: parsedRound,
    fallback: fallbackOpenRound,
  });
  const roundId = mergedRound.round?.state === 0 ? mergedRound.roundId : 0n;
  const fallbackConfig =
    fallbackRoundConfig ?? (fallbackOpenRound ? parseVotingConfig(fallbackOpenRound) : protocolConfig);
  const config = roundId > 0n ? parseVotingConfig(rawRoundConfigSnapshot ?? fallbackConfig) : fallbackConfig;

  const snapshot = deriveRoundSnapshot({
    roundId,
    round: roundId > 0n ? mergedRound.round : undefined,
    config,
    optimisticDelta,
    now,
  });

  return {
    ...snapshot,
    isLoading:
      contentId !== undefined && (isRoundIdLoading || (roundId > 0n && (isRoundLoading || isRoundConfigLoading))),
    isReady: contentId !== undefined && !isRoundIdLoading && !isRoundLoading && !isRoundConfigLoading,
  };
}

export type RoundSnapshot = ReturnType<typeof useRoundSnapshot>;
