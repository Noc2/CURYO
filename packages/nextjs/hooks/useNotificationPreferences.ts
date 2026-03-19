"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "~~/lib/notifications/shared";
import { isSignatureRejected } from "~~/utils/signatureErrors";

export type NotificationPreferences = typeof DEFAULT_NOTIFICATION_PREFERENCES;

interface UpdateNotificationPreferencesResult {
  ok: boolean;
  reason?: "not_connected" | "rejected" | "request_failed";
  error?: string;
  preferences?: NotificationPreferences;
}

interface UseNotificationPreferencesOptions {
  autoRead?: boolean;
}

async function readNotificationPreferences(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
  autoRead: boolean,
): Promise<NotificationPreferences> {
  const sessionRes = await fetch(`/api/notifications/preferences/session?address=${encodeURIComponent(address)}`);
  const sessionBody = (await sessionRes.json().catch(() => null)) as { hasSession?: boolean; error?: string } | null;
  if (!sessionRes.ok) {
    throw new Error(sessionBody?.error || "Failed to check notification preferences session");
  }

  if (sessionBody?.hasSession) {
    const existingSessionRes = await fetch(`/api/notifications/preferences?address=${encodeURIComponent(address)}`);
    if (!existingSessionRes.ok) {
      const body = (await existingSessionRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "Failed to fetch notification preferences");
    }

    return (await existingSessionRes.json()) as NotificationPreferences;
  }

  if (!autoRead) {
    return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  }

  const challengeRes = await fetch("/api/notifications/preferences/challenge", {
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

  const res = await fetch("/api/notifications/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      signature,
      challengeId: challengeData.challengeId,
    }),
  });

  const body = (await res.json().catch(() => null)) as ({ error?: string } & Partial<NotificationPreferences>) | null;
  if (!res.ok) {
    throw new Error(body?.error || "Failed to fetch notification preferences");
  }

  return {
    roundResolved: body?.roundResolved ?? DEFAULT_NOTIFICATION_PREFERENCES.roundResolved,
    settlingSoonHour: body?.settlingSoonHour ?? DEFAULT_NOTIFICATION_PREFERENCES.settlingSoonHour,
    settlingSoonDay: body?.settlingSoonDay ?? DEFAULT_NOTIFICATION_PREFERENCES.settlingSoonDay,
    followedSubmission: body?.followedSubmission ?? DEFAULT_NOTIFICATION_PREFERENCES.followedSubmission,
    followedResolution: body?.followedResolution ?? DEFAULT_NOTIFICATION_PREFERENCES.followedResolution,
  };
}

export function useNotificationPreferences(address?: string, options?: UseNotificationPreferencesOptions) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const queryKey = useMemo(() => ["notificationPreferences", address] as const, [address]);
  const autoRead = options?.autoRead ?? false;

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) return { ...DEFAULT_NOTIFICATION_PREFERENCES };

      try {
        return await readNotificationPreferences(address, signMessageAsync, autoRead);
      } catch (error) {
        if (isSignatureRejected(error)) {
          return { ...DEFAULT_NOTIFICATION_PREFERENCES };
        }
        throw error;
      }
    },
    enabled: Boolean(address),
    staleTime: Infinity,
    refetchInterval: false,
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
