"use client";

import { useCallback, useMemo } from "react";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { useAccount, useReadContracts } from "wagmi";
import { type ClaimableRewardItem, buildSubmitterClaimableRewards } from "~~/hooks/claimableRewards";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { type PonderRoundsResponse, ponderApi } from "~~/services/ponder/client";

interface SubmitterRewardClaimCandidate {
  contentId: bigint;
  roundId: bigint;
  pendingReward: bigint;
  alreadyClaimed: boolean;
}

function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

export function getClaimableSubmitterRewardsQueryKey(address?: string, chainId?: number) {
  return ["claimableSubmitterRewards", address?.toLowerCase() ?? null, chainId ?? null] as const;
}

export function useClaimableSubmitterRewards() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: distributorInfo } = useDeployedContractInfo({ contractName: "RoundRewardDistributor" });
  const { data: engineInfo } = useDeployedContractInfo({ contractName: "RoundVotingEngine" as any });

  const {
    data: ponderResult,
    isLoading: submissionsLoading,
    refetch: refetchSubmissions,
  } = usePonderQuery<
    { settledRounds: Array<{ contentId: string; rounds: PonderRoundsResponse["items"] }> },
    { settledRounds: Array<{ contentId: string; rounds: PonderRoundsResponse["items"] }> }
  >({
    queryKey: getClaimableSubmitterRewardsQueryKey(address, targetNetwork.id),
    enabled: Boolean(address),
    ponderFn: async () => {
      if (!address) {
        return { settledRounds: [] };
      }

      const contentResponse = await ponderApi.getAllContent({
        submitter: address,
        status: "all",
      });

      const settledRounds = await Promise.all(
        contentResponse.map(async contentItem => {
          const rounds = await ponderApi.getAllRounds({
            contentId: contentItem.id,
            state: String(ROUND_STATE.Settled),
          });

          return {
            contentId: contentItem.id,
            rounds,
          };
        }),
      );

      return {
        settledRounds,
      };
    },
    rpcFn: async () => ({ settledRounds: [] }),
    staleTime: 30_000,
    refetchInterval: false,
  });

  const candidates = useMemo<SubmitterRewardClaimCandidate[]>(() => {
    const result = ponderResult?.data;
    if (!result) {
      return [];
    }

    return result.settledRounds.flatMap(group =>
      group.rounds.map(round => ({
        contentId: safeBigInt(group.contentId),
        roundId: safeBigInt(round.roundId),
        pendingReward: 0n,
        alreadyClaimed: false,
      })),
    );
  }, [ponderResult?.data]);

  const claimContracts = useMemo(() => {
    if (!distributorInfo || !engineInfo || candidates.length === 0) {
      return [];
    }

    return candidates.flatMap(candidate => [
      {
        address: engineInfo.address,
        abi: engineInfo.abi,
        functionName: "pendingSubmitterReward" as const,
        args: [candidate.contentId, candidate.roundId],
      },
      {
        address: distributorInfo.address,
        abi: distributorInfo.abi,
        functionName: "submitterRewardClaimed" as const,
        args: [candidate.contentId, candidate.roundId],
      },
    ]);
  }, [candidates, distributorInfo, engineInfo]);

  const {
    data: claimResults,
    isLoading: claimsLoading,
    refetch: refetchClaims,
  } = useReadContracts({
    contracts: claimContracts,
    query: { enabled: claimContracts.length > 0 },
  });

  const claimableItems = useMemo<ClaimableRewardItem[]>(() => {
    if (!claimResults || claimResults.length !== claimContracts.length || candidates.length === 0) {
      return [];
    }

    const enriched = candidates.map((candidate, index) => {
      const pendingReward = claimResults[index * 2];
      const alreadyClaimed = claimResults[index * 2 + 1];
      return {
        contentId: candidate.contentId,
        roundId: candidate.roundId,
        pendingReward:
          pendingReward?.status === "success" && typeof pendingReward.result === "bigint" ? pendingReward.result : 0n,
        alreadyClaimed: alreadyClaimed?.status === "success" ? alreadyClaimed.result === true : true,
      };
    });

    return buildSubmitterClaimableRewards(enriched);
  }, [claimContracts.length, claimResults, candidates]);

  const totalClaimable = useMemo(() => claimableItems.reduce((sum, item) => sum + item.reward, 0n), [claimableItems]);

  const refetch = useCallback(() => {
    refetchSubmissions();
    refetchClaims();
  }, [refetchClaims, refetchSubmissions]);

  return {
    claimableItems,
    totalClaimable,
    isLoading: submissionsLoading || claimsLoading,
    refetch,
  };
}
