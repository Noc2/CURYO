"use client";

import { useMemo } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { type ClaimableRewardItem } from "~~/hooks/claimableRewards";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { QUESTION_BOUNTY_ESCROW_ABI, getConfiguredQuestionBountyEscrowAddress } from "~~/lib/questionBounties";
import { ponderApi } from "~~/services/ponder/client";

export function getClaimableQuestionBountyRewardsQueryKey(address?: string, chainId?: number) {
  return ["claimableQuestionBountyRewards", address?.toLowerCase() ?? null, chainId ?? null] as const;
}

function safeBigInt(value: unknown): bigint {
  try {
    return BigInt(value as string | number | bigint);
  } catch {
    return 0n;
  }
}

export function useClaimableQuestionBountyRewards() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const normalizedAddress = address?.toLowerCase();
  const escrowAddress = useMemo(() => getConfiguredQuestionBountyEscrowAddress(targetNetwork.id), [targetNetwork.id]);

  const {
    data: result,
    isLoading: candidatesLoading,
    refetch: refetchCandidates,
  } = usePonderQuery({
    queryKey: getClaimableQuestionBountyRewardsQueryKey(normalizedAddress, targetNetwork.id),
    ponderFn: async () => {
      if (!normalizedAddress) return [];
      const response = await ponderApi.getBountyClaimCandidates(normalizedAddress, { limit: "200" });
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
      abi: QUESTION_BOUNTY_ESCROW_ABI,
      functionName: "claimableBountyReward" as const,
      args: [safeBigInt(candidate.bountyId), safeBigInt(candidate.roundId), address],
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
          bountyId: safeBigInt(candidate.bountyId),
          contentId: safeBigInt(candidate.contentId),
          roundId: safeBigInt(candidate.roundId),
          reward,
          title: candidate.title,
          claimType: "question_bounty_reward" as const,
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
