"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "~~/lib/notifications/shared";

export type NotificationPreferences = typeof DEFAULT_NOTIFICATION_PREFERENCES;

interface UpdateNotificationPreferencesResult {
  ok: boolean;
  reason?: "not_connected" | "rejected" | "request_failed";
  error?: string;
  preferences?: NotificationPreferences;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

export function useNotificationPreferences(address?: string) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const queryKey = useMemo(() => ["notificationPreferences", address] as const, [address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

      const res = await fetch(`/api/notifications/preferences?address=${encodeURIComponent(address)}`);
      if (!res.ok) {
        throw new Error("Failed to fetch notification preferences");
      }

      return (await res.json()) as NotificationPreferences;
    },
    enabled: Boolean(address),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const preferences = data ?? DEFAULT_NOTIFICATION_PREFERENCES;

  const updatePreferences = useCallback(
    async (nextPreferences: NotificationPreferences): Promise<UpdateNotificationPreferencesResult> => {
      if (!address) {
        return { ok: false, reason: "not_connected" };
      }

      const previous = queryClient.getQueryData<NotificationPreferences>(queryKey);
      setIsSaving(true);

      try {
        queryClient.setQueryData(queryKey, nextPreferences);

        const challengeRes = await fetch("/api/notifications/preferences/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            ...nextPreferences,
          }),
        });

        const challengeData = await challengeRes.json();
        if (!challengeRes.ok) {
          throw new Error(challengeData.error || "Failed to create signature challenge");
        }

        const signature = await signMessageAsync({ message: challengeData.message as string });

        const res = await fetch("/api/notifications/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            ...nextPreferences,
            signature,
            challengeId: challengeData.challengeId,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error || "Request failed");
        }

        return { ok: true, preferences: nextPreferences };
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        await refetch();

        if (isSignatureRejected(error)) {
          return { ok: false, reason: "rejected" };
        }

        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to update notification preferences",
        };
      } finally {
        setIsSaving(false);
      }
    },
    [address, queryClient, queryKey, refetch, signMessageAsync],
  );

  const updatePreference = useCallback(
    async (key: keyof NotificationPreferences, value: boolean): Promise<UpdateNotificationPreferencesResult> => {
      return updatePreferences({
        ...preferences,
        [key]: value,
      });
    },
    [preferences, updatePreferences],
  );

  return {
    preferences,
    isLoading,
    isSaving,
    updatePreference,
    updatePreferences,
  };
}
