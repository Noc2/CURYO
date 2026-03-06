"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { buildFollowProfileMessage, buildUnfollowProfileMessage } from "~~/lib/watchlist/messages";

interface FollowedProfileItem {
  walletAddress: string;
  createdAt: string;
}

interface FollowedProfilesResponse {
  items: FollowedProfileItem[];
  count: number;
}

interface ToggleFollowResult {
  ok: boolean;
  following?: boolean;
  reason?: "not_connected" | "rejected" | "request_failed" | "self_follow";
  error?: string;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

const EMPTY_FOLLOWED_PROFILES: FollowedProfileItem[] = [];

export function useFollowedProfiles(address?: string) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [pendingAddresses, setPendingAddresses] = useState<Set<string>>(new Set());
  const normalizedAddress = address?.toLowerCase();

  const queryKey = useMemo(() => ["followedProfiles", normalizedAddress] as const, [normalizedAddress]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!normalizedAddress) {
        return { items: [], count: 0 } satisfies FollowedProfilesResponse;
      }

      const res = await fetch(`/api/follows/profiles?address=${encodeURIComponent(normalizedAddress)}`);
      if (!res.ok) {
        throw new Error("Failed to fetch followed profiles");
      }

      return (await res.json()) as FollowedProfilesResponse;
    },
    enabled: Boolean(normalizedAddress),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const followedItems = data?.items ?? EMPTY_FOLLOWED_PROFILES;
  const followedWallets = useMemo(
    () => new Set(followedItems.map(item => item.walletAddress.toLowerCase())),
    [followedItems],
  );

  const updatePending = useCallback((walletAddress: string, isPending: boolean) => {
    setPendingAddresses(prev => {
      const next = new Set(prev);
      if (isPending) {
        next.add(walletAddress);
      } else {
        next.delete(walletAddress);
      }
      return next;
    });
  }, []);

  const setOptimisticState = useCallback(
    (walletAddress: string, following: boolean) => {
      queryClient.setQueryData(queryKey, (old: FollowedProfilesResponse | undefined) => {
        const items = old?.items ?? [];

        if (following) {
          if (items.some(item => item.walletAddress.toLowerCase() === walletAddress)) {
            return old ?? { items, count: items.length };
          }

          const nextItems = [{ walletAddress, createdAt: new Date().toISOString() }, ...items];
          return { items: nextItems, count: nextItems.length };
        }

        const nextItems = items.filter(item => item.walletAddress.toLowerCase() !== walletAddress);
        return { items: nextItems, count: nextItems.length };
      });
    },
    [queryClient, queryKey],
  );

  const toggleFollow = useCallback(
    async (targetAddress: string): Promise<ToggleFollowResult> => {
      if (!normalizedAddress) {
        return { ok: false, reason: "not_connected" };
      }

      const normalizedTargetAddress = targetAddress.toLowerCase();
      if (normalizedTargetAddress === normalizedAddress) {
        return { ok: false, reason: "self_follow" };
      }

      const isFollowing = followedWallets.has(normalizedTargetAddress);
      const previous = queryClient.getQueryData<FollowedProfilesResponse>(queryKey);

      updatePending(normalizedTargetAddress, true);

      try {
        const message = isFollowing
          ? buildUnfollowProfileMessage(normalizedTargetAddress)
          : buildFollowProfileMessage(normalizedTargetAddress);
        const signature = await signMessageAsync({ message });

        setOptimisticState(normalizedTargetAddress, !isFollowing);

        const res = await fetch("/api/follows/profiles", {
          method: isFollowing ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: normalizedAddress, targetAddress: normalizedTargetAddress, signature }),
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
          error: error instanceof Error ? error.message : "Failed to update follows",
        };
      } finally {
        updatePending(normalizedTargetAddress, false);
      }
    },
    [
      normalizedAddress,
      followedWallets,
      queryClient,
      queryKey,
      refetch,
      setOptimisticState,
      signMessageAsync,
      updatePending,
    ],
  );

  const isPending = useCallback(
    (targetAddress: string) => pendingAddresses.has(targetAddress.toLowerCase()),
    [pendingAddresses],
  );

  return {
    followedItems,
    followedWallets,
    isLoading,
    toggleFollow,
    isPending,
  };
}
