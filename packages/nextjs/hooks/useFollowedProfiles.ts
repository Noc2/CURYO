"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";

export interface FollowedProfileItem {
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

interface UseFollowedProfilesOptions {
  autoRead?: boolean;
}

interface ProfileFollowSessionStatus {
  hasReadSession: boolean;
  hasWriteSession: boolean;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

const EMPTY_FOLLOWED_ITEMS: FollowedProfileItem[] = [];
const EMPTY_FOLLOWED_RESPONSE: FollowedProfilesResponse = { items: [], count: 0 };

async function getProfileFollowSessionStatus(address: string): Promise<ProfileFollowSessionStatus> {
  const sessionRes = await fetch(`/api/follows/profiles/session?address=${encodeURIComponent(address)}`);
  const sessionBody = (await sessionRes.json().catch(() => null)) as {
    hasSession?: boolean;
    hasReadSession?: boolean;
    hasWriteSession?: boolean;
    error?: string;
  } | null;

  if (!sessionRes.ok) {
    throw new Error(sessionBody?.error || "Failed to check follow session");
  }

  return {
    hasReadSession: sessionBody?.hasReadSession ?? sessionBody?.hasSession ?? false,
    hasWriteSession: sessionBody?.hasWriteSession ?? false,
  };
}

async function readFollowedProfiles(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
  autoRead: boolean,
): Promise<FollowedProfilesResponse> {
  const sessionStatus = await getProfileFollowSessionStatus(address);

  if (sessionStatus.hasReadSession) {
    const existingSessionRes = await fetch(`/api/follows/profiles?address=${encodeURIComponent(address)}`);
    if (!existingSessionRes.ok) {
      const body = (await existingSessionRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "Failed to fetch followed profiles");
    }

    const body = (await existingSessionRes.json()) as Partial<FollowedProfilesResponse>;
    return {
      items: Array.isArray(body.items) ? (body.items as FollowedProfileItem[]) : [],
      count: Array.isArray(body.items) ? body.items.length : 0,
    };
  }

  if (!autoRead) {
    return EMPTY_FOLLOWED_RESPONSE;
  }

  const challengeRes = await fetch("/api/follows/profiles/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      intent: "read",
    }),
  });

  const challengeData = (await challengeRes.json().catch(() => null)) as {
    error?: string;
    message?: string;
    challengeId?: string;
  } | null;

  if (!challengeRes.ok || !challengeData?.message || !challengeData.challengeId) {
    throw new Error(challengeData?.error || "Failed to create signature challenge");
  }

  const signature = await signMessageAsync({ message: challengeData.message });
  const res = await fetch("/api/follows/profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      signature,
      challengeId: challengeData.challengeId,
    }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error || "Failed to fetch followed profiles");
  }

  const body = (await res.json()) as Partial<FollowedProfilesResponse>;
  return {
    items: Array.isArray(body.items) ? (body.items as FollowedProfileItem[]) : [],
    count: Array.isArray(body.items) ? body.items.length : 0,
  };
}

export function useFollowedProfiles(address?: string, options?: UseFollowedProfilesOptions) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [pendingAddresses, setPendingAddresses] = useState<Set<string>>(new Set());
  const [hasWriteSession, setHasWriteSession] = useState(false);
  const autoRead = options?.autoRead ?? false;
  const normalizedAddress = address?.toLowerCase();
  const queryKey = useMemo(() => ["followedProfiles", normalizedAddress] as const, [normalizedAddress]);

  useEffect(() => {
    setHasWriteSession(false);
  }, [normalizedAddress]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!normalizedAddress) {
        return EMPTY_FOLLOWED_RESPONSE;
      }

      try {
        return await readFollowedProfiles(normalizedAddress, signMessageAsync, autoRead);
      } catch (error) {
        if (isSignatureRejected(error)) {
          return EMPTY_FOLLOWED_RESPONSE;
        }
        throw error;
      }
    },
    enabled: Boolean(normalizedAddress),
    staleTime: Infinity,
    refetchInterval: false,
  });

  const followedItems = data?.items ?? EMPTY_FOLLOWED_ITEMS;
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

      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FollowedProfilesResponse>(queryKey);
      const isFollowing = followedWallets.has(normalizedTargetAddress);
      updatePending(normalizedTargetAddress, true);

      try {
        const performSignedToggle = async () => {
          const challengeRes = await fetch("/api/follows/profiles/challenge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address: normalizedAddress,
              targetAddress: normalizedTargetAddress,
              action: isFollowing ? "unfollow" : "follow",
            }),
          });

          const challengeData = await challengeRes.json();
          if (!challengeRes.ok) {
            throw new Error(challengeData.error || "Failed to create signature challenge");
          }

          const signature = await signMessageAsync({ message: challengeData.message as string });

          return fetch("/api/follows/profiles", {
            method: isFollowing ? "DELETE" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address: normalizedAddress,
              targetAddress: normalizedTargetAddress,
              signature,
              challengeId: challengeData.challengeId,
            }),
          });
        };

        setOptimisticState(normalizedTargetAddress, !isFollowing);
        const canUseWriteSession =
          hasWriteSession || (await getProfileFollowSessionStatus(normalizedAddress)).hasWriteSession;
        if (canUseWriteSession && !hasWriteSession) {
          setHasWriteSession(true);
        }

        let res = canUseWriteSession
          ? await fetch("/api/follows/profiles", {
              method: isFollowing ? "DELETE" : "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                address: normalizedAddress,
                targetAddress: normalizedTargetAddress,
              }),
            })
          : await performSignedToggle();

        if (canUseWriteSession && res.status === 401) {
          setHasWriteSession(false);
          res = await performSignedToggle();
        }

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Request failed");
        }

        setHasWriteSession(true);
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
      queryClient,
      queryKey,
      followedWallets,
      updatePending,
      setOptimisticState,
      signMessageAsync,
      hasWriteSession,
      refetch,
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
