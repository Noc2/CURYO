"use client";

import { useMemo } from "react";
import { type Address } from "viem";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { getVoteCooldownRemainingSeconds } from "~~/lib/vote/cooldown";
import {
  type VoteCooldownContractInfo,
  findVoteCommittedEvent,
  pickVoteCooldownFallbackContract,
} from "~~/lib/vote/cooldownFallback";
import { type VoteCooldownLogLike, buildVoteCooldownItemsFromLogs } from "~~/lib/vote/cooldownLogs";
import { type PonderVoteCooldownsResponse, ponderApi } from "~~/services/ponder/client";
import { contracts } from "~~/utils/scaffold-eth/contract";

interface UseVoteCooldownsParams {
  contentIds: readonly bigint[];
  voters: readonly string[];
  nowSeconds: number;
  enabled?: boolean;
}

const PONDER_VOTE_COOLDOWN_CONTENT_ID_BATCH_SIZE = 200;

function normalizeContentIds(contentIds: readonly bigint[]) {
  const unique = new Set<string>();
  for (const contentId of contentIds) {
    if (contentId < 0n) continue;
    unique.add(contentId.toString());
  }
  return Array.from(unique);
}

function chunkList<T>(items: readonly T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function normalizeVoters(voters: readonly string[]) {
  const unique = new Set<string>();
  for (const voter of voters) {
    const normalized = voter.trim().toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

export function useVoteCooldowns({ contentIds, voters, nowSeconds, enabled = true }: UseVoteCooldownsParams) {
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const isPageVisible = usePageVisibility();
  const { data: votingEngineInfo } = useDeployedContractInfo({
    contractName: "RoundVotingEngine" as any,
    chainId: targetNetwork.id as any,
  });
  const normalizedContentIds = useMemo(() => normalizeContentIds(contentIds), [contentIds]);
  const normalizedVoters = useMemo(() => normalizeVoters(voters), [voters]);
  const contentIdsKey = normalizedContentIds.join(",");
  const votersKey = normalizedVoters.join(",");
  const queryEnabled = enabled && normalizedContentIds.length > 0 && normalizedVoters.length > 0;
  const configuredVotingEngineInfo = contracts?.[targetNetwork.id]?.RoundVotingEngine as
    | VoteCooldownContractInfo
    | undefined;
  const voteCooldownContractInfo = pickVoteCooldownFallbackContract(votingEngineInfo, configuredVotingEngineInfo);
  const voteCommittedEvent = useMemo(
    () => findVoteCommittedEvent(voteCooldownContractInfo),
    [voteCooldownContractInfo],
  );
  const rpcCooldownFallbackEnabled = Boolean(publicClient && voteCooldownContractInfo?.address && voteCommittedEvent);

  const { data: result, isLoading } = usePonderQuery<PonderVoteCooldownsResponse, PonderVoteCooldownsResponse>({
    queryKey: ["voteCooldowns", targetNetwork.id, voteCooldownContractInfo?.address ?? null, contentIdsKey, votersKey],
    enabled: queryEnabled,
    ponderFn: async () => {
      const batches = chunkList(normalizedContentIds, PONDER_VOTE_COOLDOWN_CONTENT_ID_BATCH_SIZE);
      const responses = await Promise.all(
        batches.map(batch =>
          ponderApi.getVoteCooldowns({
            contentIds: batch.join(","),
            voters: votersKey,
          }),
        ),
      );

      return {
        items: responses.flatMap(response => response.items),
      };
    },
    rpcFn: async () => {
      if (!publicClient || !voteCooldownContractInfo?.address || !voteCommittedEvent) {
        return { items: [] };
      }

      const fromBlock = BigInt(voteCooldownContractInfo.deployedOnBlock ?? 0);
      const logGroups = await Promise.all(
        normalizedContentIds.flatMap(contentId =>
          normalizedVoters.map(voter =>
            publicClient.getLogs({
              address: voteCooldownContractInfo.address,
              event: voteCommittedEvent,
              fromBlock,
              args: {
                contentId: BigInt(contentId),
                voter: voter as Address,
              },
            }),
          ),
        ),
      );
      const items = await buildVoteCooldownItemsFromLogs(logGroups.flat() as VoteCooldownLogLike[], async log => {
        const latestBlockNumber = log.blockNumber;
        if (log.blockHash == null && latestBlockNumber == null) {
          return null;
        }

        const block =
          log.blockHash != null
            ? await publicClient.getBlock({ blockHash: log.blockHash })
            : await publicClient.getBlock({ blockNumber: latestBlockNumber ?? undefined });

        return Number(block.timestamp);
      });

      return { items };
    },
    rpcEnabled: rpcCooldownFallbackEnabled,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
  });

  const cooldownByContentId = useMemo(() => {
    const cooldowns = new Map<string, number>();

    for (const item of result?.data.items ?? []) {
      const remainingSeconds = getVoteCooldownRemainingSeconds(item.latestCommittedAt, nowSeconds);
      if (remainingSeconds <= 0) continue;

      const previous = cooldowns.get(item.contentId) ?? 0;
      if (remainingSeconds > previous) {
        cooldowns.set(item.contentId, remainingSeconds);
      }
    }

    return cooldowns;
  }, [nowSeconds, result?.data.items]);

  return {
    cooldownByContentId,
    isLoading: isLoading || (queryEnabled && result === undefined),
  };
}
