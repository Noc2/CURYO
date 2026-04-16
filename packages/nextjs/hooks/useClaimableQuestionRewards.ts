"use client";

import { useMemo } from "react";
import { isAddress, zeroAddress } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { type ClaimableRewardItem } from "~~/hooks/claimableRewards";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useDelegation } from "~~/hooks/useDelegation";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import {
  QUESTION_REWARD_POOL_ESCROW_ABI,
  getConfiguredQuestionRewardPoolEscrowAddress,
} from "~~/lib/questionRewardPools";
import { ponderApi } from "~~/services/ponder/client";

export function getClaimableQuestionRewardsQueryKey(addresses?: readonly string[], chainId?: number) {
  return ["claimableQuestionRewards", addresses?.join(",") ?? null, chainId ?? null] as const;
}

export function buildClaimableQuestionRewardCandidateVoters(params: {
  address?: string | null;
  delegateTo?: string | null;
  delegateOf?: string | null;
}) {
  const voters = [params.address, params.delegateTo, params.delegateOf]
    .map(value => value?.toLowerCase())
    .filter((value): value is string => !!value && isAddress(value) && value !== zeroAddress);

  return [...new Set(voters)];
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
  const { delegateTo, delegateOf, isLoading: delegationLoading } = useDelegation(normalizedAddress);
  const escrowAddress = useMemo(
    () => getConfiguredQuestionRewardPoolEscrowAddress(targetNetwork.id),
    [targetNetwork.id],
  );
  const candidateVoters = useMemo(
    () =>
      buildClaimableQuestionRewardCandidateVoters({
        address: normalizedAddress,
        delegateTo,
        delegateOf,
      }),
    [delegateOf, delegateTo, normalizedAddress],
  );
  const voterQuery = useMemo(() => candidateVoters.join(","), [candidateVoters]);

  const {
    data: result,
    isLoading: candidatesLoading,
    refetch: refetchCandidates,
  } = usePonderQuery({
    queryKey: getClaimableQuestionRewardsQueryKey(candidateVoters, targetNetwork.id),
    ponderFn: async () => {
      if (!voterQuery) return [];
      const response = await ponderApi.getQuestionRewardClaimCandidates(voterQuery, { limit: "200" });
      return response.items;
    },
    rpcFn: async () => [],
    enabled: candidateVoters.length > 0 && !delegationLoading,
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
    isLoading: candidatesLoading || claimablesLoading || delegationLoading,
    refetch: () => {
      refetchCandidates();
      refetchClaimables();
    },
  };
}
