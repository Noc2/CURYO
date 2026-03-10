"use client";

import { useEffect, useState } from "react";
import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useVotingConfig } from "~~/hooks/useVotingConfig";
import { deriveRoundSnapshot, parseRound } from "~~/lib/contracts/roundVotingEngine";

export function useRoundSnapshot(contentId?: bigint) {
  const { getOptimisticDelta } = useOptimisticVote();
  const optimisticDelta = contentId !== undefined ? getOptimisticDelta(contentId) : undefined;
  const config = useVotingConfig();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const { data: rawActiveRoundId, isLoading: isRoundIdLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getActiveRoundId" as any,
    args: [contentId] as any,
    query: {
      enabled: contentId !== undefined,
      refetchInterval: 5000,
    },
  } as any);
  const roundId = (rawActiveRoundId as unknown as bigint | undefined) ?? 0n;

  const { data: rawRoundData, isLoading: isRoundLoading } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getRound" as any,
    args: [contentId, roundId] as any,
    query: {
      enabled: contentId !== undefined && roundId > 0n,
      refetchInterval: 5000,
    },
  } as any);

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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
