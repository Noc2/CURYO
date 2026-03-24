"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import {
  DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
  type EmailNotificationSettingsPayload,
  type EmailNotificationSettingsState,
} from "~~/lib/notifications/emailShared";
import { isSignatureRejected } from "~~/utils/signatureErrors";

interface UpdateEmailNotificationSettingsResult {
  ok: boolean;
  reason?: "not_connected" | "rejected" | "request_failed";
  error?: string;
  settings?: EmailNotificationSettingsState;
  verificationSent?: boolean;
}

interface UseEmailNotificationSettingsOptions {
  autoRead?: boolean;
}

async function readEmailNotificationSettings(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
  autoRead: boolean,
): Promise<EmailNotificationSettingsState> {
  const sessionRes = await fetch(`/api/notifications/email/session?address=${encodeURIComponent(address)}`);
  const sessionBody = (await sessionRes.json().catch(() => null)) as { hasSession?: boolean; error?: string } | null;
  if (!sessionRes.ok) {
    throw new Error(sessionBody?.error || "Failed to check email notification session");
  }

  if (sessionBody?.hasSession) {
    const existingSessionRes = await fetch(`/api/notifications/email?address=${encodeURIComponent(address)}`);
    if (!existingSessionRes.ok) {
      const body = (await existingSessionRes.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error || "Failed to fetch email notification settings");
    }

    return (await existingSessionRes.json()) as EmailNotificationSettingsState;
  }

  if (!autoRead) {
    return { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS };
  }

  const challengeRes = await fetch("/api/notifications/email/challenge", {
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

  const res = await fetch("/api/notifications/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      signature,
      challengeId: challengeData.challengeId,
    }),
  });

  const body = (await res.json().catch(() => null)) as
    | ({ error?: string } & Partial<EmailNotificationSettingsState>)
    | null;
  if (!res.ok) {
    throw new Error(body?.error || "Failed to fetch email notification settings");
  }
  return body as EmailNotificationSettingsState;
}

export function useEmailNotificationSettings(address?: string, options?: UseEmailNotificationSettingsOptions) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const queryKey = useMemo(() => ["emailNotificationSettings", address] as const, [address]);
  const autoRead = options?.autoRead ?? false;

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) return { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS };

      try {
        return await readEmailNotificationSettings(address, signMessageAsync, autoRead);
      } catch (error) {
        if (isSignatureRejected(error)) {
          return { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS };
        }
        throw error;
      }
    },
    enabled: Boolean(address),
    staleTime: Infinity,
    refetchInterval: false,
  });

  const settings = data ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS;

  const updateSettings = useCallback(
    async (nextSettings: EmailNotificationSettingsPayload): Promise<UpdateEmailNotificationSettingsResult> => {
      if (!address) {
        return { ok: false, reason: "not_connected" };
      }

      const previous = queryClient.getQueryData<EmailNotificationSettingsState>(queryKey);
      setIsSaving(true);

      try {
        queryClient.setQueryData(queryKey, {
          ...nextSettings,
          verified:
            settings.verified &&
            settings.email.trim().toLowerCase() === nextSettings.email.trim().toLowerCase() &&
            nextSettings.email.trim().length > 0,
        });

        const challengeRes = await fetch("/api/notifications/email/challenge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            ...nextSettings,
          }),
        });

        const challengeData = await challengeRes.json();
        if (!challengeRes.ok) {
          throw new Error(challengeData.error || "Failed to create signature challenge");
        }

        const signature = await signMessageAsync({ message: challengeData.message as string });

        const res = await fetch("/api/notifications/email", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            address,
            ...nextSettings,
            signature,
            challengeId: challengeData.challengeId,
          }),
        });

        const body = (await res.json().catch(() => null)) as {
          error?: string;
          settings?: EmailNotificationSettingsState;
          verificationSent?: boolean;
        } | null;

        if (!res.ok) {
          throw new Error(body?.error || "Request failed");
        }

        if (body?.settings) {
          queryClient.setQueryData(queryKey, body.settings);
        }

        return {
          ok: true,
          settings: body?.settings,
          verificationSent: body?.verificationSent,
        };
      } catch (error) {
        queryClient.setQueryData(queryKey, previous);
        await refetch();

        if (isSignatureRejected(error)) {
          return { ok: false, reason: "rejected" };
        }

        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to update email notification settings",
        };
      } finally {
        setIsSaving(false);
      }
    },
    [address, queryClient, queryKey, refetch, settings.email, settings.verified, signMessageAsync],
  );

  return {
    settings,
    isLoading,
    isSaving,
    updateSettings,
  };
}
