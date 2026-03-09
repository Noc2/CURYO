"use client";

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDeployedContractInfo, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { PonderFollowResponse, ponderApi } from "~~/services/ponder/client";

interface FollowedProfileItem {
  walletAddress: string;
  createdAt: string;
}

interface ToggleFollowResult {
  ok: boolean;
  following?: boolean;
  reason?: "not_connected" | "rejected" | "request_failed" | "self_follow";
  error?: string;
}

function isTransactionRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

const EMPTY_FOLLOWED_PROFILES: FollowedProfileItem[] = [];
const EMPTY_RESPONSE: PonderFollowResponse = {
  items: [],
  total: 0,
  limit: 200,
  offset: 0,
};

type FollowQueryData = {
  data: PonderFollowResponse;
  source: "ponder" | "rpc";
};

export function useFollowedProfiles(address?: string) {
  const queryClient = useQueryClient();
  const normalizedAddress = address?.toLowerCase();
  const [pendingAddresses, setPendingAddresses] = useState<Set<string>>(new Set());
  const queryKey = useMemo(() => ["followedProfiles", normalizedAddress] as const, [normalizedAddress]);
  const { data: followRegistry } = useDeployedContractInfo({ contractName: "FollowRegistry" as any });
  const { writeContractAsync } = useScaffoldWriteContract({ contractName: "FollowRegistry" as any });

  const { data, isLoading } = usePonderQuery<PonderFollowResponse, PonderFollowResponse>({
    queryKey,
    ponderFn: async () => {
      if (!normalizedAddress) {
        return EMPTY_RESPONSE;
      }

      return ponderApi.getFollowing(normalizedAddress, { limit: "200" });
    },
    rpcFn: async () => EMPTY_RESPONSE,
    enabled: Boolean(normalizedAddress),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const followedItems =
    data?.data.items.map(item => ({
      walletAddress: item.walletAddress,
      createdAt: item.createdAt,
    })) ?? EMPTY_FOLLOWED_PROFILES;

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
      queryClient.setQueryData(["ponder-fallback", ...queryKey], (old: FollowQueryData | undefined) => {
        const current = old?.data ?? EMPTY_RESPONSE;
        const items = current.items.map(item => ({
          walletAddress: item.walletAddress,
          createdAt: item.createdAt,
          profileName: item.profileName ?? null,
          profileImageUrl: item.profileImageUrl ?? null,
        }));

        if (following) {
          if (items.some(item => item.walletAddress.toLowerCase() === walletAddress)) {
            return old ?? { data: current, source: "rpc" as const };
          }

          const nextItems = [
            {
              walletAddress,
              createdAt: new Date().toISOString(),
              profileName: null,
              profileImageUrl: null,
            },
            ...items,
          ];
          return {
            data: { ...current, items: nextItems, total: nextItems.length },
            source: old?.source ?? ("rpc" as const),
          };
        }

        const nextItems = items.filter(item => item.walletAddress.toLowerCase() !== walletAddress);
        return {
          data: { ...current, items: nextItems, total: nextItems.length },
          source: old?.source ?? ("rpc" as const),
        };
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

      if (!followRegistry) {
        return {
          ok: false,
          reason: "request_failed",
          error: "FollowRegistry is not deployed on the current network yet.",
        };
      }

      const isFollowing = followedWallets.has(normalizedTargetAddress);
      const previous = queryClient.getQueryData(["ponder-fallback", ...queryKey]);
      updatePending(normalizedTargetAddress, true);

      try {
        setOptimisticState(normalizedTargetAddress, !isFollowing);

        await (writeContractAsync as any)({
          functionName: isFollowing ? "unfollow" : "follow",
          args: [normalizedTargetAddress],
        });

        return { ok: true, following: !isFollowing };
      } catch (error) {
        queryClient.setQueryData(["ponder-fallback", ...queryKey], previous);

        if (isTransactionRejected(error)) {
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
      followRegistry,
      followedWallets,
      queryClient,
      queryKey,
      setOptimisticState,
      updatePending,
      writeContractAsync,
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
