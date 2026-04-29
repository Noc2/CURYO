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

export function getClaimableQuestionBundleRewardsQueryKey(addresses?: readonly string[], chainId?: number) {
  return ["claimableQuestionBundleRewards", addresses?.join(",") ?? null, chainId ?? null] as const;
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

  const {
    data: bundleResult,
    isLoading: bundleCandidatesLoading,
    refetch: refetchBundleCandidates,
  } = usePonderQuery({
    queryKey: getClaimableQuestionBundleRewardsQueryKey(candidateVoters, targetNetwork.id),
    ponderFn: async () => {
      if (!voterQuery) return [];
      const response = await ponderApi.getQuestionBundleRewardClaimCandidates(voterQuery, { limit: "200" });
      return response.items;
    },
    rpcFn: async () => [],
    enabled: candidateVoters.length > 0 && !delegationLoading,
    staleTime: 30_000,
  });

  const candidates = useMemo(() => result?.data ?? [], [result?.data]);
  const bundleCandidates = useMemo(() => bundleResult?.data ?? [], [bundleResult?.data]);
  const claimableContracts = useMemo(() => {
    if (!address || !escrowAddress || candidates.length === 0) return [];
    return candidates.map(candidate => ({
      address: escrowAddress,
      abi: QUESTION_REWARD_POOL_ESCROW_ABI,
      functionName: "claimableQuestionReward" as const,
      args: [safeBigInt(candidate.rewardPoolId), safeBigInt(candidate.roundId), address],
    }));
  }, [address, candidates, escrowAddress]);
  const bundleClaimableContracts = useMemo(() => {
    if (!address || !escrowAddress || bundleCandidates.length === 0) return [];
    return bundleCandidates.map(candidate => ({
      address: escrowAddress,
      abi: QUESTION_REWARD_POOL_ESCROW_ABI,
      functionName: "claimableQuestionBundleReward" as const,
      args: [safeBigInt(candidate.bundleId), BigInt(candidate.roundSetIndex ?? 0), address],
    }));
  }, [address, bundleCandidates, escrowAddress]);

  const {
    data: claimableResults,
    isLoading: claimablesLoading,
    refetch: refetchClaimables,
  } = useReadContracts({
    contracts: claimableContracts,
    query: { enabled: claimableContracts.length > 0 },
  });
  const {
    data: bundleClaimableResults,
    isLoading: bundleClaimablesLoading,
    refetch: refetchBundleClaimables,
  } = useReadContracts({
    contracts: bundleClaimableContracts,
    query: { enabled: bundleClaimableContracts.length > 0 },
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

  const bundleClaimableItems = useMemo<ClaimableRewardItem[]>(() => {
    if (!bundleClaimableResults || bundleClaimableResults.length !== bundleCandidates.length) return [];
    return bundleCandidates.flatMap((candidate, index) => {
      const resultItem = bundleClaimableResults[index];
      const reward = resultItem?.status === "success" ? safeBigInt(resultItem.result) : 0n;
      if (reward <= 0n) return [];
      const bundleId = safeBigInt(candidate.bundleId);
      const roundSetIndex = BigInt(candidate.roundSetIndex ?? 0);
      return [
        {
          bundleId,
          roundSetIndex,
          reward,
          title: `Bundle #${bundleId.toString()} round set ${roundSetIndex + 1n}`,
          claimType: "question_bundle_reward" as const,
        },
      ];
    });
  }, [bundleCandidates, bundleClaimableResults]);

  const allClaimableItems = useMemo(
    () => [...claimableItems, ...bundleClaimableItems],
    [bundleClaimableItems, claimableItems],
  );

  const totalClaimable = useMemo(
    () => allClaimableItems.reduce((sum, item) => sum + item.reward, 0n),
    [allClaimableItems],
  );

  return {
    claimableItems: allClaimableItems,
    totalClaimable,
    isLoading:
      candidatesLoading || claimablesLoading || bundleCandidatesLoading || bundleClaimablesLoading || delegationLoading,
    refetch: () => {
      refetchCandidates();
      refetchClaimables();
      refetchBundleCandidates();
      refetchBundleClaimables();
    },
  };
}
