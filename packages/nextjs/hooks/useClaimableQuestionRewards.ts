"use client";

import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { type ClaimableRewardItem } from "~~/hooks/claimableRewards";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import {
  QUESTION_REWARD_POOL_ESCROW_ABI,
  getConfiguredQuestionRewardPoolEscrowAddress,
} from "~~/lib/questionRewardPools";
import { ponderApi } from "~~/services/ponder/client";

export function getClaimableQuestionRewardsQueryKey(address?: string, chainId?: number) {
  return ["claimableQuestionRewards", address?.toLowerCase() ?? null, chainId ?? null] as const;
}

function safeBigInt(value: unknown): bigint {
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return 0n;
  }
}

export function useClaimableQuestionRewards() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const normalizedAddress = address?.toLowerCase();
  const escrowAddress = useMemo(
    () => getConfiguredQuestionRewardPoolEscrowAddress(targetNetwork.id),
    [targetNetwork.id],
  );

  const {
    data: result,
    isLoading: candidatesLoading,
    refetch: refetchCandidates,
  } = usePonderQuery({
    queryKey: getClaimableQuestionRewardsQueryKey(normalizedAddress, targetNetwork.id),
    ponderFn: async () => {
      if (!normalizedAddress) return [];
      const response = await ponderApi.getQuestionRewardClaimCandidates(normalizedAddress, { limit: "200" });
      return response.items;
    },
    rpcFn: async () => [],
    enabled: Boolean(normalizedAddress),
    staleTime: 30_000,
  });

  const candidates = useMemo(() => result?.data ?? [], [result?.data]);
  const claimableContracts = useMemo(() => {
    if (!address || !escrowAddress || candidates.length === 0) return [];
    return candidates.map(candidate => ({
      address: escrowAddress,
      abi: QUESTION_REWARD_POOL_ESCROW_ABI,
      functionName: "claimableQuestionReward" as const,
      args: [safeBigInt(candidate.rewardPoolId), safeBigInt(candidate.roundId), address],
    }));
  }, [address, candidates, escrowAddress]);

  const {
    data: claimableResults,
    isLoading: claimablesLoading,
    refetch: refetchClaimables,
  } = useReadContracts({
    contracts: claimableContracts,
    query: { enabled: claimableContracts.length > 0 },
  });

  const claimableItems = useMemo<ClaimableRewardItem[]>(() => {
    if (!claimableResults || claimableResults.length !== candidates.length) return [];
    return candidates.flatMap((candidate, index) => {
      const resultItem = claimableResults[index];
      const reward = resultItem?.status === "success" ? safeBigInt(resultItem.result) : 0n;
      if (reward <= 0n) return [];
      return [
        {
          rewardPoolId: safeBigInt(candidate.rewardPoolId),
          contentId: safeBigInt(candidate.contentId),
          roundId: safeBigInt(candidate.roundId),
          reward,
          title: candidate.title,
          claimType: "question_reward" as const,
        },
      ];
    });
  }, [candidates, claimableResults]);

  const totalClaimable = useMemo(() => claimableItems.reduce((sum, item) => sum + item.reward, 0n), [claimableItems]);

  return {
    claimableItems,
    totalClaimable,
    isLoading: candidatesLoading || claimablesLoading,
    refetch: () => {
      refetchCandidates();
      refetchClaimables();
    },
  };
}
