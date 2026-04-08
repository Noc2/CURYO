"use client";

import { useCallback, useMemo } from "react";
import { ParticipationPoolAbi } from "@curyo/contracts/abis";
import { useAccount, useReadContracts } from "wagmi";
import { type ClaimableRewardItem, buildSubmitterParticipationClaimableRewards } from "~~/hooks/claimableRewards";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface SubmitterParticipationClaimCandidate {
  contentId: bigint;
  totalReward: bigint;
  alreadyPaid: bigint;
  reservedReward: bigint;
  rewardPool: `0x${string}` | null;
}

function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

export function getClaimableSubmitterParticipationRewardsQueryKey(address?: string, chainId?: number) {
  return ["claimableSubmitterParticipationRewards", address?.toLowerCase() ?? null, chainId ?? null] as const;
}

export function useClaimableSubmitterParticipationRewards() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ContentRegistry" });

  const {
    data: ponderResult,
    isLoading: contentLoading,
    refetch: refetchContent,
  } = usePonderQuery<{ contentIds: string[] }, { contentIds: string[] }>({
    queryKey: getClaimableSubmitterParticipationRewardsQueryKey(address, targetNetwork.id),
    enabled: Boolean(address),
    ponderFn: async () => {
      if (!address) {
        return { contentIds: [] };
      }

      const contentItems = await ponderApi.getAllContent({
        submitter: address,
        status: "all",
      });

      return {
        contentIds: contentItems.filter(item => item.submitterStakeReturned).map(item => item.id),
      };
    },
    rpcFn: async () => ({ contentIds: [] }),
    staleTime: 30_000,
    refetchInterval: false,
  });

  const contentIds = useMemo(
    () =>
      (ponderResult?.data.contentIds ?? []).map(contentId => safeBigInt(contentId)).filter(contentId => contentId > 0n),
    [ponderResult?.data.contentIds],
  );

  const rewardContracts = useMemo(() => {
    if (!registryInfo || contentIds.length === 0) {
      return [];
    }

    return contentIds.flatMap(contentId => [
      {
        address: registryInfo.address,
        abi: registryInfo.abi,
        functionName: "submitterParticipationRewardOwed" as const,
        args: [contentId],
      },
      {
        address: registryInfo.address,
        abi: registryInfo.abi,
        functionName: "submitterParticipationRewardPaid" as const,
        args: [contentId],
      },
      {
        address: registryInfo.address,
        abi: registryInfo.abi,
        functionName: "submitterParticipationRewardReserved" as const,
        args: [contentId],
      },
      {
        address: registryInfo.address,
        abi: registryInfo.abi,
        functionName: "submitterParticipationRewardPool" as const,
        args: [contentId],
      },
    ]);
  }, [contentIds, registryInfo]);

  const {
    data: rewardResults,
    isLoading: rewardsLoading,
    refetch: refetchRewards,
  } = useReadContracts({
    contracts: rewardContracts,
    query: { enabled: rewardContracts.length > 0 },
  });

  const candidates = useMemo<SubmitterParticipationClaimCandidate[]>(() => {
    if (!rewardResults || rewardResults.length !== rewardContracts.length || contentIds.length === 0) {
      return [];
    }

    return contentIds.map((contentId, index) => {
      const owed = rewardResults[index * 4];
      const paid = rewardResults[index * 4 + 1];
      const reserved = rewardResults[index * 4 + 2];
      const pool = rewardResults[index * 4 + 3];
      const rewardPool =
        pool?.status === "success" && typeof pool.result === "string" && pool.result.toLowerCase() !== ZERO_ADDRESS
          ? (pool.result.toLowerCase() as `0x${string}`)
          : null;

      return {
        contentId,
        totalReward: owed?.status === "success" && typeof owed.result === "bigint" ? owed.result : 0n,
        alreadyPaid: paid?.status === "success" && typeof paid.result === "bigint" ? paid.result : 0n,
        reservedReward: reserved?.status === "success" && typeof reserved.result === "bigint" ? reserved.result : 0n,
        rewardPool,
      };
    });
  }, [contentIds, rewardContracts.length, rewardResults]);

  const uniqueRewardPools = useMemo(
    () => [...new Set(candidates.map(candidate => candidate.rewardPool).filter(Boolean))] as `0x${string}`[],
    [candidates],
  );

  const poolContracts = useMemo(() => {
    if (!registryInfo || uniqueRewardPools.length === 0) {
      return [];
    }

    return uniqueRewardPools.flatMap(rewardPool => [
      {
        address: rewardPool,
        abi: ParticipationPoolAbi,
        functionName: "authorizedCallers" as const,
        args: [registryInfo.address],
      },
      {
        address: rewardPool,
        abi: ParticipationPoolAbi,
        functionName: "poolBalance" as const,
        args: [],
      },
    ]);
  }, [registryInfo, uniqueRewardPools]);

  const {
    data: poolResults,
    isLoading: poolLoading,
    refetch: refetchPools,
  } = useReadContracts({
    contracts: poolContracts,
    query: { enabled: poolContracts.length > 0 },
  });

  const poolStates = useMemo(() => {
    const next = new Map<`0x${string}`, { authorized: boolean; poolBalance: bigint }>();
    if (!poolResults || poolResults.length !== poolContracts.length) {
      return next;
    }

    uniqueRewardPools.forEach((rewardPool, index) => {
      const authorized = poolResults[index * 2];
      const poolBalance = poolResults[index * 2 + 1];

      next.set(rewardPool, {
        authorized: authorized?.status === "success" && authorized.result === true,
        poolBalance:
          poolBalance?.status === "success" && typeof poolBalance.result === "bigint" ? poolBalance.result : 0n,
      });
    });

    return next;
  }, [poolContracts.length, poolResults, uniqueRewardPools]);

  const claimableItems = useMemo<ClaimableRewardItem[]>(
    () => buildSubmitterParticipationClaimableRewards(candidates, poolStates),
    [candidates, poolStates],
  );

  const totalClaimable = useMemo(() => claimableItems.reduce((sum, item) => sum + item.reward, 0n), [claimableItems]);

  const refetch = useCallback(() => {
    refetchContent();
    refetchRewards();
    refetchPools();
  }, [refetchContent, refetchPools, refetchRewards]);

  return {
    claimableItems,
    totalClaimable,
    isLoading: contentLoading || rewardsLoading || poolLoading,
    refetch,
  };
}
