"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useDelegation } from "~~/hooks/useDelegation";
import { useProfileRegistry } from "~~/hooks/useProfileRegistry";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import {
  DEFAULT_EMAIL_NOTIFICATION_SETTINGS,
  type EmailNotificationSettingsState,
} from "~~/lib/notifications/emailShared";
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferencesState } from "~~/lib/notifications/shared";

interface SessionStatusResponse {
  hasSession: boolean;
}

async function readSessionStatus(path: string, address: string): Promise<SessionStatusResponse> {
  const res = await fetch(`${path}?address=${encodeURIComponent(address)}`, { cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { hasSession?: boolean; error?: string } | null;
  if (!res.ok) {
    throw new Error(body?.error || "Failed to check session status");
  }
  return { hasSession: body?.hasSession ?? false };
}

async function readNotificationPreferences(address: string): Promise<NotificationPreferencesState | null> {
  const res = await fetch(`/api/notifications/preferences?address=${encodeURIComponent(address)}`, {
    cache: "no-store",
  });
  if (res.status === 401) return null;

  const body = (await res.json().catch(() => null)) as
    | ({ error?: string } & Partial<NotificationPreferencesState>)
    | null;
  if (!res.ok) {
    throw new Error(body?.error || "Failed to load notification preferences");
  }

  return {
    roundResolved: body?.roundResolved ?? DEFAULT_NOTIFICATION_PREFERENCES.roundResolved,
    settlingSoonHour: body?.settlingSoonHour ?? DEFAULT_NOTIFICATION_PREFERENCES.settlingSoonHour,
    settlingSoonDay: body?.settlingSoonDay ?? DEFAULT_NOTIFICATION_PREFERENCES.settlingSoonDay,
    followedSubmission: body?.followedSubmission ?? DEFAULT_NOTIFICATION_PREFERENCES.followedSubmission,
    followedResolution: body?.followedResolution ?? DEFAULT_NOTIFICATION_PREFERENCES.followedResolution,
  };
}

async function readEmailNotificationSettings(address: string): Promise<EmailNotificationSettingsState | null> {
  const res = await fetch(`/api/notifications/email?address=${encodeURIComponent(address)}`, { cache: "no-store" });
  if (res.status === 401) return null;

  const body = (await res.json().catch(() => null)) as
    | ({ error?: string } & Partial<EmailNotificationSettingsState>)
    | null;
  if (!res.ok) {
    throw new Error(body?.error || "Failed to load email notification settings");
  }

  return {
    email: body?.email ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS.email,
    verified: body?.verified ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS.verified,
    roundResolved: body?.roundResolved ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS.roundResolved,
    settlingSoonHour: body?.settlingSoonHour ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS.settlingSoonHour,
    settlingSoonDay: body?.settlingSoonDay ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS.settlingSoonDay,
    followedSubmission: body?.followedSubmission ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS.followedSubmission,
    followedResolution: body?.followedResolution ?? DEFAULT_EMAIL_NOTIFICATION_SETTINGS.followedResolution,
  };
}

export function countEnabledPreferences(preferences: NotificationPreferencesState) {
  return Object.values(preferences).filter(Boolean).length;
}

export function countEnabledEmailPreferences(settings: EmailNotificationSettingsState) {
  return [
    settings.roundResolved,
    settings.settlingSoonHour,
    settings.settlingSoonDay,
    settings.followedSubmission,
    settings.followedResolution,
  ].filter(Boolean).length;
}

export function useSettingsOverview(address?: string, refreshNonce = 0) {
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");
  const { hasVoterId, tokenId, isLoading: voterIdLoading } = useVoterIdNFT(address);
  const { profile, hasProfile, isLoading: profileLoading } = useProfileRegistry(address);
  const delegation = useDelegation(address);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserPermission("unsupported");
      return;
    }

    setBrowserPermission(Notification.permission);
  }, [refreshNonce]);

  const notificationSessionQuery = useQuery({
    queryKey: ["settingsOverview", "notificationSession", address, refreshNonce],
    queryFn: () => readSessionStatus("/api/notifications/preferences/session", address!),
    enabled: Boolean(address),
    staleTime: 60_000,
  });

  const emailSessionQuery = useQuery({
    queryKey: ["settingsOverview", "emailSession", address, refreshNonce],
    queryFn: () => readSessionStatus("/api/notifications/email/session", address!),
    enabled: Boolean(address),
    staleTime: 60_000,
  });

  const notificationPreferencesQuery = useQuery({
    queryKey: ["settingsOverview", "notificationPreferences", address, refreshNonce],
    queryFn: () => readNotificationPreferences(address!),
    enabled: Boolean(address) && Boolean(notificationSessionQuery.data?.hasSession),
    staleTime: 60_000,
  });

  const emailSettingsQuery = useQuery({
    queryKey: ["settingsOverview", "emailSettings", address, refreshNonce],
    queryFn: () => readEmailNotificationSettings(address!),
    enabled: Boolean(address) && Boolean(emailSessionQuery.data?.hasSession),
    staleTime: 60_000,
  });

  return {
    address,
    browserPermission,
    hasVoterId,
    tokenId,
    isIdentityLoading: voterIdLoading,
    profile,
    hasProfile,
    isProfileLoading: profileLoading,
    delegation,
    hasNotificationReadSession: notificationSessionQuery.data?.hasSession ?? false,
    notificationPreferences: notificationPreferencesQuery.data ?? null,
    isNotificationSummaryLoading:
      notificationSessionQuery.isLoading ||
      (notificationSessionQuery.data?.hasSession ? notificationPreferencesQuery.isLoading : false),
    hasEmailReadSession: emailSessionQuery.data?.hasSession ?? false,
    emailSettings: emailSettingsQuery.data ?? null,
    isEmailSummaryLoading:
      emailSessionQuery.isLoading || (emailSessionQuery.data?.hasSession ? emailSettingsQuery.isLoading : false),
  };
}
