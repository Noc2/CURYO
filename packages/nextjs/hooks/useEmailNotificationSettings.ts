"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import {
  DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
  type EmailNotificationSettingsPayload,
  type EmailNotificationSettingsState,
} from "~~/lib/notifications/emailShared";

interface UpdateEmailNotificationSettingsResult {
  ok: boolean;
  reason?: "not_connected" | "rejected" | "request_failed";
  error?: string;
  settings?: EmailNotificationSettingsState;
  verificationSent?: boolean;
}

function isSignatureRejected(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("rejected") || message.includes("denied") || message.includes("declined");
}

async function readEmailNotificationSettings(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
): Promise<EmailNotificationSettingsState> {
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

export function useEmailNotificationSettings(address?: string) {
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const queryKey = useMemo(() => ["emailNotificationSettings", address] as const, [address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) return { ...DEFAULT_EMAIL_NOTIFICATION_SETTINGS };

      try {
        return await readEmailNotificationSettings(address, signMessageAsync);
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
