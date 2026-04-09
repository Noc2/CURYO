"use client";

import { useMemo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { usePageVisibility } from "~~/hooks/usePageVisibility";

interface FrontendClaimableFeeItem {
  contentId: string;
  roundId: string;
  title: string | null;
  description: string | null;
  url: string | null;
  settledAt: string | null;
  claimableFee: string;
  totalFrontendPool: string;
  frontendStake: string;
  totalEligibleStake: string;
  totalFrontendClaimants: number;
}

interface FrontendClaimableFeePage {
  items: FrontendClaimableFeeItem[];
  hasMore: boolean;
  nextOffset: number;
  scannedRounds: number;
  totalRounds: number;
}

const PAGE_SIZE = 10;

export async function fetchClaimableFrontendFeePage(
  frontend: `0x${string}`,
  chainId: number,
  limit: number,
  offset: number,
) {
  const response = await fetch(
    `/api/frontend/claimable-fees?frontend=${frontend}&chainId=${chainId}&limit=${limit}&offset=${offset}`,
  );

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to fetch claimable frontend fees");
  }

  return (await response.json()) as FrontendClaimableFeePage;
}

export function useFrontendClaimableFees(frontend?: `0x${string}`, chainId?: number) {
  const isPageVisible = usePageVisibility();
  const query = useInfiniteQuery({
    queryKey: ["frontend-claimable-fees", chainId, frontend],
    initialPageParam: 0,
    enabled: !!frontend && Number.isFinite(chainId),
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
    queryFn: ({ pageParam }) => fetchClaimableFrontendFeePage(frontend!, chainId!, PAGE_SIZE, pageParam),
    getNextPageParam: lastPage => (lastPage.hasMore ? lastPage.nextOffset : undefined),
  });

  const items = useMemo(() => query.data?.pages.flatMap(page => page.items) ?? [], [query.data]);

  const totalClaimable = useMemo(() => items.reduce((total, item) => total + BigInt(item.claimableFee), 0n), [items]);

  return {
    ...query,
    items,
    totalClaimable,
  };
}
