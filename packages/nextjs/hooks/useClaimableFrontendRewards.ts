"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { type ClaimableRewardItem } from "~~/hooks/claimableRewards";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { fetchClaimableFrontendFeePage } from "~~/hooks/useFrontendClaimableFees";
import { usePageVisibility } from "~~/hooks/usePageVisibility";

const FRONTEND_CLAIMABLE_FEES_PAGE_SIZE = 50;

function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

async function fetchAllClaimableFrontendFees(frontend: `0x${string}`, chainId: number) {
  const items: Awaited<ReturnType<typeof fetchClaimableFrontendFeePage>>["items"] = [];
  let offset = 0;
  let scannedRounds = 0;
  let totalRounds = 0;

  while (true) {
    const page = await fetchClaimableFrontendFeePage(frontend, chainId, FRONTEND_CLAIMABLE_FEES_PAGE_SIZE, offset);
    items.push(...page.items);
    scannedRounds = page.scannedRounds;
    totalRounds = page.totalRounds;

    if (!page.hasMore) {
      return { items, scannedRounds, totalRounds };
    }

    offset = page.nextOffset;
  }
}

function getClaimableFrontendRewardsQueryKey(address?: string, chainId?: number) {
  return ["claimableFrontendRewards", address?.toLowerCase() ?? null, chainId ?? null] as const;
}

export function useClaimableFrontendRewards() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const isPageVisible = usePageVisibility();

  const {
    data: frontendInfo,
    isLoading: frontendInfoLoading,
    refetch: refetchFrontendInfo,
  } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
    query: {
      enabled: !!address,
      staleTime: 30_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  const isRegistered = frontendInfo ? frontendInfo[1] > 0n : false;
  const isSlashed = frontendInfo ? frontendInfo[3] : false;
  const canWithdrawFees = isRegistered && frontendInfo?.[2] === true;

  const {
    data: exitAvailableAt,
    isLoading: exitAvailableAtLoading,
    refetch: refetchExitAvailableAt,
  } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "frontendExitAvailableAt",
    args: [address],
    query: {
      enabled: !!address && isRegistered,
      staleTime: 30_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  const isExitPending = typeof exitAvailableAt === "bigint" ? exitAvailableAt > 0n : false;
  const canCreditRoundFees = isRegistered && !isSlashed && (canWithdrawFees || isExitPending);

  const {
    data: accumulatedFees,
    isLoading: accumulatedFeesLoading,
    refetch: refetchAccumulatedFees,
  } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getAccumulatedFees",
    args: [address],
    query: {
      enabled: !!address && isRegistered,
      staleTime: 30_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  const frontendAddress = address?.toLowerCase() as `0x${string}` | undefined;
  const roundFeesQuery = useQuery({
    queryKey: getClaimableFrontendRewardsQueryKey(frontendAddress, targetNetwork.id),
    enabled: !!frontendAddress && canCreditRoundFees,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
    queryFn: () => fetchAllClaimableFrontendFees(frontendAddress!, targetNetwork.id),
  });

  const roundFeeItems = useMemo<ClaimableRewardItem[]>(() => {
    if (!frontendAddress || !canCreditRoundFees) {
      return [];
    }

    return (roundFeesQuery.data?.items ?? []).flatMap(item => {
      const reward = safeBigInt(item.claimableFee);
      const contentId = safeBigInt(item.contentId);
      const roundId = safeBigInt(item.roundId);
      if (reward <= 0n || contentId <= 0n || roundId <= 0n) {
        return [];
      }

      return [
        {
          contentId,
          roundId,
          frontend: frontendAddress,
          reward,
          claimType: "frontend_round_fee" as const,
        } satisfies ClaimableRewardItem,
      ];
    });
  }, [canCreditRoundFees, frontendAddress, roundFeesQuery.data?.items]);

  const claimableItems = useMemo<ClaimableRewardItem[]>(() => {
    if (!frontendAddress) {
      return [];
    }

    const items = [...roundFeeItems];
    const withdrawableFees = canWithdrawFees ? (accumulatedFees ?? 0n) : 0n;
    if (canWithdrawFees && (withdrawableFees > 0n || roundFeeItems.length > 0)) {
      items.push({
        frontend: frontendAddress,
        reward: withdrawableFees,
        claimType: "frontend_registry_fee",
      } satisfies ClaimableRewardItem);
    }

    return items;
  }, [accumulatedFees, canWithdrawFees, frontendAddress, roundFeeItems]);

  const totalClaimable = useMemo(() => claimableItems.reduce((sum, item) => sum + item.reward, 0n), [claimableItems]);

  const refetch = useCallback(() => {
    refetchFrontendInfo();
    refetchExitAvailableAt();
    refetchAccumulatedFees();
    if (frontendAddress && canCreditRoundFees) {
      void roundFeesQuery.refetch();
    }
  }, [
    canCreditRoundFees,
    frontendAddress,
    refetchAccumulatedFees,
    refetchExitAvailableAt,
    refetchFrontendInfo,
    roundFeesQuery,
  ]);

  return {
    claimableItems,
    totalClaimable,
    isLoading:
      frontendInfoLoading ||
      exitAvailableAtLoading ||
      accumulatedFeesLoading ||
      (canCreditRoundFees && roundFeesQuery.isLoading),
    refetch,
  };
}
