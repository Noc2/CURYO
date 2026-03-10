"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";

interface FollowedCategoryItem {
  categoryId: string;
  createdAt: string;
}

interface FollowedCategoryResponse {
  items: FollowedCategoryItem[];
  count: number;
}

interface ToggleFollowedCategoryResult {
  ok: boolean;
  following?: boolean;
  reason?: "not_connected" | "rejected" | "request_failed";
  error?: string;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

const EMPTY_FOLLOWED_CATEGORIES: FollowedCategoryItem[] = [];

export function useFollowedCategories(address?: string) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const queryKey = useMemo(() => ["followedCategories", address] as const, [address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) {
        return { items: [], count: 0 } satisfies FollowedCategoryResponse;
      }

      const res = await fetch(`/api/follows/categories?address=${encodeURIComponent(address)}`);
      if (!res.ok) {
        throw new Error("Failed to fetch followed categories");
      }

      return (await res.json()) as FollowedCategoryResponse;
    },
    enabled: Boolean(address),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const followedItems = data?.items ?? EMPTY_FOLLOWED_CATEGORIES;
  const followedCategoryIds = useMemo(() => new Set(followedItems.map(item => item.categoryId)), [followedItems]);

  const updatePending = useCallback((categoryId: string, isPending: boolean) => {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (isPending) {
        next.add(categoryId);
      } else {
        next.delete(categoryId);
      }
      return next;
    });
  }, []);

  const setOptimisticState = useCallback(
    (categoryId: string, following: boolean) => {
      queryClient.setQueryData(queryKey, (old: FollowedCategoryResponse | undefined) => {
        const items = old?.items ?? [];

        if (following) {
          if (items.some(item => item.categoryId === categoryId)) {
            return old ?? { items, count: items.length };
          }

          const nextItems = [{ categoryId, createdAt: new Date().toISOString() }, ...items];
          return { items: nextItems, count: nextItems.length };
        }

        const nextItems = items.filter(item => item.categoryId !== categoryId);
        return { items: nextItems, count: nextItems.length };
      });
    },
    [queryClient, queryKey],
  );

  const toggleCategoryFollow = useCallback(
    async (categoryId: bigint): Promise<ToggleFollowedCategoryResult> => {
      if (!address) {
        return { ok: false, reason: "not_connected" };
      }

      const categoryIdStr = categoryId.toString();
      const isFollowing = followedCategoryIds.has(categoryIdStr);
      const previous = queryClient.getQueryData<FollowedCategoryResponse>(queryKey);

      updatePending(categoryIdStr, true);

      try {
        const challengeRes = await fetch("/api/follows/categories/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            categoryId: categoryIdStr,
            action: isFollowing ? "unfollow" : "follow",
          }),
        });

        const challengeData = await challengeRes.json();
        if (!challengeRes.ok) {
          throw new Error(challengeData.error || "Failed to create signature challenge");
        }

        const signature = await signMessageAsync({ message: challengeData.message as string });

        setOptimisticState(categoryIdStr, !isFollowing);

        const res = await fetch("/api/follows/categories", {
          method: isFollowing ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            categoryId: categoryIdStr,
            signature,
            challengeId: challengeData.challengeId,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Request failed");
        }

        return { ok: true, following: !isFollowing };
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        await refetch();

        if (isSignatureRejected(error)) {
          return { ok: false, reason: "rejected" };
        }

        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to update category follows",
        };
      } finally {
        updatePending(categoryIdStr, false);
      }
    },
    [address, followedCategoryIds, queryClient, queryKey, refetch, setOptimisticState, signMessageAsync, updatePending],
  );

  const isPending = useCallback((categoryId: bigint) => pendingIds.has(categoryId.toString()), [pendingIds]);

  return {
    followedItems,
    followedCategoryIds,
    isLoading,
    toggleCategoryFollow,
    isPending,
  };
}
