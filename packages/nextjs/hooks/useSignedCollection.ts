"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export interface SignedCollectionResponse<TItem> {
  items: TItem[];
  count: number;
}

export interface SignedCollectionSessionStatus {
  hasReadSession: boolean;
  hasWriteSession: boolean;
}

export interface SignedCollectionToggleResult<TExtraReason extends string = never> {
  ok: boolean;
  selected?: boolean;
  reason?: "not_connected" | "rejected" | "request_failed" | TExtraReason;
  error?: string;
}

interface SignedChallengeResponse {
  challengeId?: string;
  message?: string;
  error?: string;
}

interface UseSignedCollectionConfig<TItem, TId, TExtraReason extends string = never> {
  address?: string;
  autoRead?: boolean;
  queryKey: readonly unknown[];
  emptyResponse: SignedCollectionResponse<TItem>;
  sessionPath: string;
  collectionPath: string;
  challengePath: string;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
  getItemKey: (item: TItem) => string;
  normalizeId: (id: TId) => string;
  createOptimisticItem: (normalizedId: string) => TItem;
  buildReadChallengeRequest: (address: string) => Record<string, unknown>;
  buildSignedReadRequest: (address: string, challengeId: string, signature: `0x${string}`) => Record<string, unknown>;
  buildWriteChallengeRequest: (
    address: string,
    normalizedId: string,
    currentlySelected: boolean,
  ) => Record<string, unknown>;
  buildSignedWriteRequest: (
    address: string,
    normalizedId: string,
    currentlySelected: boolean,
    challengeId: string,
    signature: `0x${string}`,
  ) => Record<string, unknown>;
  buildSessionWriteRequest: (
    address: string,
    normalizedId: string,
    currentlySelected: boolean,
  ) => Record<string, unknown>;
  validateToggle?: (normalizedId: string, address: string) => TExtraReason | null;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

async function readResponseBody<T>(response: Response, fallbackError: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(body?.error || fallbackError);
  }

  return body as T;
}

async function getSignedCollectionSessionStatus(
  sessionPath: string,
  address: string,
): Promise<SignedCollectionSessionStatus> {
  const sessionRes = await fetch(`${sessionPath}?address=${encodeURIComponent(address)}`);
  const sessionBody = await readResponseBody<{
    hasSession?: boolean;
    hasReadSession?: boolean;
    hasWriteSession?: boolean;
  }>(sessionRes, "Failed to check session status");

  return {
    hasReadSession: sessionBody.hasReadSession ?? sessionBody.hasSession ?? false,
    hasWriteSession: sessionBody.hasWriteSession ?? false,
  };
}

async function readSignedCollection<TItem>(
  config: Pick<
    UseSignedCollectionConfig<TItem, string>,
    | "autoRead"
    | "buildReadChallengeRequest"
    | "buildSignedReadRequest"
    | "challengePath"
    | "collectionPath"
    | "emptyResponse"
    | "sessionPath"
    | "signMessageAsync"
  >,
  address: string,
): Promise<SignedCollectionResponse<TItem>> {
  const sessionStatus = await getSignedCollectionSessionStatus(config.sessionPath, address);

  if (sessionStatus.hasReadSession) {
    const response = await fetch(`${config.collectionPath}?address=${encodeURIComponent(address)}`);
    const body = await readResponseBody<Partial<SignedCollectionResponse<TItem>>>(
      response,
      "Failed to fetch collection",
    );

    return {
      items: Array.isArray(body.items) ? body.items : [],
      count: Array.isArray(body.items) ? body.items.length : 0,
    };
  }

  if (!config.autoRead) {
    return config.emptyResponse;
  }

  const challengeRes = await fetch(config.challengePath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config.buildReadChallengeRequest(address)),
  });
  const challengeData = await readResponseBody<SignedChallengeResponse>(
    challengeRes,
    "Failed to create signature challenge",
  );

  if (!challengeData.message || !challengeData.challengeId) {
    throw new Error("Failed to create signature challenge");
  }

  const signature = await config.signMessageAsync({ message: challengeData.message });
  const response = await fetch(config.collectionPath, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config.buildSignedReadRequest(address, challengeData.challengeId, signature)),
  });
  const body = await readResponseBody<Partial<SignedCollectionResponse<TItem>>>(response, "Failed to fetch collection");

  return {
    items: Array.isArray(body.items) ? body.items : [],
    count: Array.isArray(body.items) ? body.items.length : 0,
  };
}

export function useSignedCollection<TItem, TId, TExtraReason extends string = never>(
  config: UseSignedCollectionConfig<TItem, TId, TExtraReason>,
) {
  const queryClient = useQueryClient();
  const [pendingKeys, setPendingKeys] = useState<Set<string>>(new Set());
  const [hasWriteSession, setHasWriteSession] = useState(false);

  useEffect(() => {
    setHasWriteSession(false);
  }, [config.address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: config.queryKey,
    queryFn: async () => {
      if (!config.address) {
        return config.emptyResponse;
      }

      try {
        return await readSignedCollection<TItem>(config, config.address);
      } catch (error) {
        if (isSignatureRejected(error)) {
          return config.emptyResponse;
        }
        throw error;
      }
    },
    enabled: Boolean(config.address),
    staleTime: Infinity,
    refetchInterval: false,
  });

  const items = data?.items ?? config.emptyResponse.items;
  const itemKeys = useMemo(() => new Set(items.map(item => config.getItemKey(item))), [config, items]);

  const updatePending = useCallback((normalizedId: string, isPending: boolean) => {
    setPendingKeys(prev => {
      const next = new Set(prev);
      if (isPending) {
        next.add(normalizedId);
      } else {
        next.delete(normalizedId);
      }
      return next;
    });
  }, []);

  const setOptimisticState = useCallback(
    (normalizedId: string, selected: boolean) => {
      queryClient.setQueryData(config.queryKey, (old: SignedCollectionResponse<TItem> | undefined) => {
        const existingItems = old?.items ?? config.emptyResponse.items;

        if (selected) {
          if (existingItems.some(item => config.getItemKey(item) === normalizedId)) {
            return old ?? { items: existingItems, count: existingItems.length };
          }

          const nextItems = [config.createOptimisticItem(normalizedId), ...existingItems];
          return { items: nextItems, count: nextItems.length };
        }

        const nextItems = existingItems.filter(item => config.getItemKey(item) !== normalizedId);
        return { items: nextItems, count: nextItems.length };
      });
    },
    [config, queryClient],
  );

  const toggleItem = useCallback(
    async (id: TId): Promise<SignedCollectionToggleResult<TExtraReason>> => {
      if (!config.address) {
        return { ok: false, reason: "not_connected" };
      }

      const normalizedId = config.normalizeId(id);
      const extraReason = config.validateToggle?.(normalizedId, config.address) ?? null;
      if (extraReason) {
        return { ok: false, reason: extraReason };
      }

      await queryClient.cancelQueries({ queryKey: config.queryKey });
      const previous = queryClient.getQueryData<SignedCollectionResponse<TItem>>(config.queryKey);
      const currentlySelected = itemKeys.has(normalizedId);

      updatePending(normalizedId, true);

      try {
        const performSignedToggle = async () => {
          const challengeRes = await fetch(config.challengePath, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(config.buildWriteChallengeRequest(config.address!, normalizedId, currentlySelected)),
          });
          const challengeData = await readResponseBody<SignedChallengeResponse>(
            challengeRes,
            "Failed to create signature challenge",
          );

          if (!challengeData.message || !challengeData.challengeId) {
            throw new Error("Failed to create signature challenge");
          }

          const signature = await config.signMessageAsync({ message: challengeData.message });

          return fetch(config.collectionPath, {
            method: currentlySelected ? "DELETE" : "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              config.buildSignedWriteRequest(
                config.address!,
                normalizedId,
                currentlySelected,
                challengeData.challengeId,
                signature,
              ),
            ),
          });
        };

        setOptimisticState(normalizedId, !currentlySelected);
        const canUseWriteSession =
          hasWriteSession ||
          (await getSignedCollectionSessionStatus(config.sessionPath, config.address)).hasWriteSession;
        if (canUseWriteSession && !hasWriteSession) {
          setHasWriteSession(true);
        }

        let response = canUseWriteSession
          ? await fetch(config.collectionPath, {
              method: currentlySelected ? "DELETE" : "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(config.buildSessionWriteRequest(config.address, normalizedId, currentlySelected)),
            })
          : await performSignedToggle();

        if (canUseWriteSession && response.status === 401) {
          setHasWriteSession(false);
          response = await performSignedToggle();
        }

        await readResponseBody(response, "Request failed");
        setHasWriteSession(true);
        return { ok: true, selected: !currentlySelected };
      } catch (error) {
        queryClient.setQueryData(config.queryKey, previous);
        await refetch();

        if (isSignatureRejected(error)) {
          return { ok: false, reason: "rejected" };
        }

        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Request failed",
        };
      } finally {
        updatePending(normalizedId, false);
      }
    },
    [config, hasWriteSession, itemKeys, queryClient, refetch, setOptimisticState, updatePending],
  );

  const isPending = useCallback((id: TId) => pendingKeys.has(config.normalizeId(id)), [config, pendingKeys]);

  return {
    items,
    itemKeys,
    isLoading,
    toggleItem,
    isPending,
  };
}
