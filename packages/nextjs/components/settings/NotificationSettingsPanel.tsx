"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { BellAlertIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { useEmailNotificationSettings } from "~~/hooks/useEmailNotificationSettings";
import { type NotificationPreferences, useNotificationPreferences } from "~~/hooks/useNotificationPreferences";
import { type EmailNotificationSettingsPayload } from "~~/lib/notifications/emailShared";
import { notification } from "~~/utils/scaffold-eth";

const NOTIFICATION_OPTIONS: {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
}[] = [
  {
    key: "roundResolved",
    label: "Round resolved",
    description: "Notify when content you watched or voted on resolves.",
  },
  {
    key: "settlingSoonHour",
    label: "Settling within 1 hour",
    description: "Get a heads-up when tracked rounds look close to settlement.",
  },
  {
    key: "settlingSoonDay",
    label: "Settling today",
    description: "See a broader daily reminder for watched or voted rounds.",
  },
  {
    key: "followedSubmission",
    label: "Followed curator submissions",
    description: "Notify when someone you follow submits new content.",
  },
  {
    key: "followedResolution",
    label: "Followed curator outcomes",
    description: "Notify when a followed curator has a round resolve.",
  },
];

function NotificationPreferenceToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 rounded-2xl bg-base-300 px-4 py-3">
      <div>
        <div className="text-base font-medium text-base-content">{label}</div>
        <p className="mt-1 text-sm text-base-content/50">{description}</p>
      </div>
      <input
        type="checkbox"
        className="toggle toggle-sm toggle-primary mt-1"
        checked={checked}
        disabled={disabled}
        onChange={event => onChange(event.target.checked)}
      />
    </label>
  );
}

export function NotificationSettingsPanel({
  address,
  onStatusChange,
}: {
  address?: string;
  onStatusChange?: () => void;
}) {
  const { openConnectModal } = useConnectModal();
  const { preferences, isSaving, isLoading, updatePreference } = useNotificationPreferences(address, {
    autoRead: true,
  });
  const {
    settings: emailSettings,
    isLoading: isEmailLoading,
    isSaving: isEmailSaving,
    updateSettings: updateEmailSettings,
  } = useEmailNotificationSettings(address);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailQueryStatus, setEmailQueryStatus] = useState<string | null>(null);
  const [emailPreferenceDrafts, setEmailPreferenceDrafts] = useState<Omit<EmailNotificationSettingsPayload, "email">>({
    roundResolved: false,
    settlingSoonHour: false,
    settlingSoonDay: false,
    followedSubmission: false,
    followedResolution: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    setEmailQueryStatus(new URLSearchParams(window.location.search).get("email"));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserPermission("unsupported");
      return;
    }

    setBrowserPermission(Notification.permission);
  }, []);

  useEffect(() => {
    setEmailDraft(emailSettings.email);
    setEmailPreferenceDrafts({
      roundResolved: emailSettings.roundResolved,
      settlingSoonHour: emailSettings.settlingSoonHour,
      settlingSoonDay: emailSettings.settlingSoonDay,
      followedSubmission: emailSettings.followedSubmission,
      followedResolution: emailSettings.followedResolution,
    });
  }, [
    emailSettings.email,
    emailSettings.followedResolution,
    emailSettings.followedSubmission,
    emailSettings.roundResolved,
    emailSettings.settlingSoonDay,
    emailSettings.settlingSoonHour,
  ]);

  useEffect(() => {
    if (emailQueryStatus === "verified") {
      notification.success("Email verified. Curyo can now send email notifications to that address.");
    } else if (emailQueryStatus === "invalid") {
      notification.error("That verification link is invalid or expired.");
    }
  }, [emailQueryStatus]);

  const handleTogglePreference = useCallback(
    async (key: keyof NotificationPreferences, value: boolean) => {
      const result = await updatePreference(key, value);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          openConnectModal?.();
          return;
        }

        if (result.reason !== "rejected") {
          notification.error(result.error || "Failed to update notification settings");
        }
        return;
      }

      onStatusChange?.();
      notification.success("Notification settings updated");
    },
    [onStatusChange, openConnectModal, updatePreference],
  );

  const requestBrowserPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserPermission("unsupported");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setBrowserPermission(permission);

      if (permission === "granted") {
        onStatusChange?.();
        notification.success("Browser notifications enabled");
      } else if (permission === "denied") {
        onStatusChange?.();
        notification.info("Browser notifications are blocked in this browser.");
      }
    } catch {
      notification.error("Failed to request browser notification permission");
    }
  }, [onStatusChange]);

  const hasEmail = emailDraft.trim().length > 0;
  const emailPayload = useMemo<EmailNotificationSettingsPayload>(
    () => ({
      email: emailDraft.trim().toLowerCase(),
      ...emailPreferenceDrafts,
    }),
    [emailDraft, emailPreferenceDrafts],
  );

  const emailDirty =
    emailPayload.email !== emailSettings.email ||
    emailPayload.roundResolved !== emailSettings.roundResolved ||
    emailPayload.settlingSoonHour !== emailSettings.settlingSoonHour ||
    emailPayload.settlingSoonDay !== emailSettings.settlingSoonDay ||
    emailPayload.followedSubmission !== emailSettings.followedSubmission ||
    emailPayload.followedResolution !== emailSettings.followedResolution;

  const handleSaveEmailSettings = useCallback(async () => {
    const result = await updateEmailSettings(emailPayload);

    if (!result.ok) {
      if (result.reason === "not_connected") {
        openConnectModal?.();
        return;
      }

      if (result.reason !== "rejected") {
        notification.error(result.error || "Failed to update email notification settings");
      }
      return;
    }

    if (!emailPayload.email) {
      onStatusChange?.();
      notification.success("Email notifications removed");
      return;
    }

    if (result.verificationSent) {
      onStatusChange?.();
      notification.success("Verification email sent");
      return;
    }

    onStatusChange?.();
    notification.success("Email notification settings updated");
  }, [emailPayload, onStatusChange, openConnectModal, updateEmailSettings]);

  if (!address) {
    return (
      <div className="surface-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-primary">
              <BellAlertIcon className="h-4 w-4" />
              Notifications
            </div>
            <h2 className="mt-3 text-3xl font-semibold text-base-content sm:text-4xl">Notification settings</h2>
            <p className="mt-3 text-base text-base-content/60">
              Connect your wallet to choose which in-app, browser, and email alerts you want to receive.
            </p>
          </div>
          <button type="button" onClick={openConnectModal} className="btn btn-submit px-6">
            Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="surface-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-primary">
              <BellAlertIcon className="h-4 w-4" />
              Notifications
            </div>
            <h2 className="mt-3 text-3xl font-semibold text-base-content sm:text-4xl">Notification settings</h2>
          </div>
          <div className="rounded-2xl bg-base-300 px-4 py-3 text-sm text-base-content/60">
            {browserPermission === "granted"
              ? "Browser notifications are enabled."
              : browserPermission === "denied"
                ? "Browser notifications are blocked in this browser."
                : browserPermission === "unsupported"
                  ? "This browser does not support Notification API."
                  : "Browser notifications still need permission."}
          </div>
        </div>
      </section>

      <section className="surface-card rounded-3xl p-6 sm:p-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-base-content">In-app and browser alerts</h2>
          </div>
          {browserPermission === "default" ? (
            <button type="button" onClick={() => void requestBrowserPermission()} className="btn btn-submit btn-sm">
              Enable browser notifications
            </button>
          ) : null}
        </div>

        <div className="space-y-3">
          {NOTIFICATION_OPTIONS.map(option => (
            <NotificationPreferenceToggle
              key={option.key}
              label={option.label}
              description={option.description}
              checked={preferences[option.key]}
              disabled={isSaving || isLoading}
              onChange={checked => {
                void handleTogglePreference(option.key, checked);
              }}
            />
          ))}
        </div>
      </section>

      <section className="surface-card rounded-3xl p-6 sm:p-8">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-base-content/[0.06] px-3 py-1 text-sm font-semibold uppercase tracking-wide text-base-content/65">
              <EnvelopeIcon className="h-4 w-4" />
              Email delivery
            </div>
            <h2 className="mt-3 text-xl font-semibold text-base-content">Email notifications</h2>
          </div>
          <div className="rounded-2xl bg-base-300 px-4 py-3 text-sm text-base-content/60">
            {!emailSettings.email
              ? "No email configured yet."
              : emailSettings.verified
                ? `Verified: ${emailSettings.email}`
                : `Verification pending for ${emailSettings.email}`}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-base-content/65" htmlFor="notification-email">
              Delivery email
            </label>
            <input
              id="notification-email"
              type="email"
              value={emailDraft}
              onChange={event => setEmailDraft(event.target.value)}
              placeholder="you@example.com"
              className="input input-bordered w-full bg-base-200/50 text-base"
              autoComplete="email"
            />
            <p className="mt-2 text-sm text-base-content/45">
              Clearing the address removes all email notifications for this wallet.
            </p>
          </div>

          <div className="space-y-3">
            {NOTIFICATION_OPTIONS.map(option => (
              <NotificationPreferenceToggle
                key={`email-${option.key}`}
                label={option.label}
                description={option.description}
                checked={emailPreferenceDrafts[option.key]}
                disabled={!hasEmail || isEmailSaving || isEmailLoading}
                onChange={checked => {
                  setEmailPreferenceDrafts(current => ({
                    ...current,
                    [option.key]: checked,
                  }));
                }}
              />
            ))}
          </div>

          {!emailSettings.verified && hasEmail ? (
            <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-warning">
              Verify this address from your inbox before Curyo starts sending email notifications.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSaveEmailSettings()}
              disabled={isEmailSaving || (!emailDirty && emailPayload.email.length > 0)}
              className="btn btn-submit disabled:bg-base-content/60 disabled:text-base-100/70"
            >
              {isEmailSaving ? "Saving..." : emailPayload.email ? "Save email settings" : "Remove email notifications"}
            </button>
            {!emailSettings.verified && hasEmail ? (
              <button
                type="button"
                onClick={() => void handleSaveEmailSettings()}
                disabled={isEmailSaving}
                className="btn btn-submit"
              >
                Resend verification
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
