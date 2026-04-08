"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { type Abi, type AbiEvent, type Address } from "viem";
import { usePublicClient } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { getVoteCooldownRemainingSeconds } from "~~/lib/vote/cooldown";
import { pickLatestVoteCommittedLog } from "~~/lib/vote/liveCooldown";

interface UseLiveVoteCooldownParams {
  contentId?: bigint;
  voters: string[];
  nowSeconds: number;
  enabled?: boolean;
}

export function useLiveVoteCooldown({ contentId, voters, nowSeconds, enabled = true }: UseLiveVoteCooldownParams) {
  const { targetNetwork } = useTargetNetwork();
  const publicClient = usePublicClient({ chainId: targetNetwork.id });
  const isPageVisible = usePageVisibility();
  const { data: votingEngineInfo } = useDeployedContractInfo({
    contractName: "RoundVotingEngine" as any,
    chainId: targetNetwork.id as any,
  });

  const normalizedVoters = useMemo(() => {
    const unique = new Set<string>();
    for (const voter of voters) {
      const normalized = voter.trim().toLowerCase();
      if (!normalized) continue;
      unique.add(normalized);
    }
    return Array.from(unique);
  }, [voters]);

  const voteCommittedEvent = useMemo(() => {
    if (!votingEngineInfo) return undefined;
    return (votingEngineInfo.abi as Abi).find(
      abiItem => abiItem.type === "event" && abiItem.name === "VoteCommitted",
    ) as AbiEvent | undefined;
  }, [votingEngineInfo]);

  const queryEnabled =
    enabled &&
    contentId !== undefined &&
    normalizedVoters.length > 0 &&
    Boolean(publicClient) &&
    Boolean(votingEngineInfo?.address) &&
    Boolean(voteCommittedEvent);

  const { data: latestCommitTimestampSeconds = null, isLoading } = useQuery({
    queryKey: [
      "live-vote-cooldown",
      targetNetwork.id,
      votingEngineInfo?.address ?? null,
      contentId?.toString() ?? null,
      normalizedVoters.join(","),
    ],
    enabled: queryEnabled,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
    queryFn: async () => {
      if (!publicClient || !votingEngineInfo?.address || !voteCommittedEvent || contentId === undefined) {
        return null;
      }

      const fromBlock = BigInt(votingEngineInfo.deployedOnBlock ?? 0);
      const logGroups = await Promise.all(
        normalizedVoters.map(voter =>
          publicClient.getLogs({
            address: votingEngineInfo.address,
            event: voteCommittedEvent,
            fromBlock,
            args: {
              contentId,
              voter: voter as Address,
            },
          }),
        ),
      );

      const latestLog = pickLatestVoteCommittedLog(logGroups.flat());
      if (!latestLog) {
        return null;
      }
      const latestBlockNumber = latestLog.blockNumber;
      if (latestLog.blockHash == null && latestBlockNumber == null) {
        return null;
      }

      const block =
        latestLog.blockHash != null
          ? await publicClient.getBlock({ blockHash: latestLog.blockHash })
          : await publicClient.getBlock({ blockNumber: latestBlockNumber });

      return Number(block.timestamp);
    },
  });

  const cooldownSecondsRemaining = useMemo(() => {
    if (latestCommitTimestampSeconds == null) return 0;
    return getVoteCooldownRemainingSeconds(new Date(latestCommitTimestampSeconds * 1000).toISOString(), nowSeconds);
  }, [latestCommitTimestampSeconds, nowSeconds]);

  return {
    cooldownSecondsRemaining,
    isLoading,
    latestCommitTimestampSeconds,
  };
}
