"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { useVotingConfig } from "~~/hooks/useVotingConfig";
import { deriveRoundSnapshot, parseRound } from "~~/lib/contracts/roundVotingEngine";
import { type QueueCardStatus, getQueueCardStatus, getQueueCardStatusFromOpenRound } from "~~/lib/vote/queueCardStatus";

type FeedSource = "ponder" | "rpc";

export function useQueueCardStatusMap(items: ContentItem[], source: FeedSource, now: number) {
  const config = useVotingConfig();
  const isPageVisible = usePageVisibility();
  const { data: roundVotingEngineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });
  const needsRpcSnapshot = source === "rpc" && !!roundVotingEngineInfo?.address && items.length > 0;
  const refetchInterval = isPageVisible ? 10_000 : false;

  const currentRoundContracts = useMemo(() => {
    if (!needsRpcSnapshot || !roundVotingEngineInfo) return [];

    return items.map(item => ({
      address: roundVotingEngineInfo.address,
      abi: roundVotingEngineInfo.abi,
      functionName: "currentRoundId" as const,
      args: [item.id],
    }));
  }, [items, needsRpcSnapshot, roundVotingEngineInfo]);

  const { data: currentRoundResults } = useReadContracts({
    contracts: currentRoundContracts,
    query: {
      enabled: currentRoundContracts.length > 0,
      refetchInterval,
    },
  });

  const currentRoundIds = useMemo(
    () =>
      items.map((_, index) => {
        const result = currentRoundResults?.[index];
        return result?.status === "success" ? ((result.result as bigint | undefined) ?? 0n) : 0n;
      }),
    [currentRoundResults, items],
  );

  const roundContracts = useMemo(() => {
    if (!needsRpcSnapshot || !roundVotingEngineInfo) return [];

    return items.flatMap((item, index) => {
      const roundId = currentRoundIds[index] ?? 0n;
      if (roundId <= 0n) return [];

      return [
        {
          address: roundVotingEngineInfo.address,
          abi: roundVotingEngineInfo.abi,
          functionName: "rounds" as const,
          args: [item.id, roundId],
        },
      ];
    });
  }, [currentRoundIds, items, needsRpcSnapshot, roundVotingEngineInfo]);

  const { data: roundResults } = useReadContracts({
    contracts: roundContracts,
    query: {
      enabled: roundContracts.length > 0,
      refetchInterval,
    },
  });

  return useMemo(() => {
    const statuses = new Map<string, QueueCardStatus | null>();

    if (source === "ponder") {
      for (const item of items) {
        statuses.set(
          item.id.toString(),
          getQueueCardStatusFromOpenRound({
            openRound: item.openRound,
            now,
            config,
          }),
        );
      }

      return statuses;
    }

    let roundResultIndex = 0;
    for (const [index, item] of items.entries()) {
      const roundId = currentRoundIds[index] ?? 0n;
      if (roundId <= 0n) {
        statuses.set(item.id.toString(), null);
        continue;
      }

      const roundResult = roundResults?.[roundResultIndex];
      roundResultIndex += 1;

      if (roundResult?.status !== "success") {
        statuses.set(item.id.toString(), null);
        continue;
      }

      const snapshot = deriveRoundSnapshot({
        roundId,
        round: parseRound(roundResult.result),
        config,
        now,
      });

      statuses.set(item.id.toString(), getQueueCardStatus(snapshot));
    }

    return statuses;
  }, [config, currentRoundIds, items, now, roundResults, source]);
}
