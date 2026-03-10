"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { BellAlertIcon } from "@heroicons/react/24/outline";
import { type NotificationPreferences, useNotificationPreferences } from "~~/hooks/useNotificationPreferences";
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
    <label className="flex items-start justify-between gap-4 rounded-2xl border border-base-content/10 bg-base-content/[0.03] px-4 py-3">
      <div>
        <div className="text-base font-medium text-white">{label}</div>
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

export function NotificationSettingsPanel({ address }: { address?: string }) {
  const { openConnectModal } = useConnectModal();
  const { preferences, isSaving, isLoading, updatePreference } = useNotificationPreferences(address);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserPermission("unsupported");
      return;
    }

    setBrowserPermission(Notification.permission);
  }, []);

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

      notification.success("Notification settings updated");
    },
    [openConnectModal, updatePreference],
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
        notification.success("Browser notifications enabled");
      } else if (permission === "denied") {
        notification.info("Browser notifications are blocked in this browser.");
      }
    } catch {
      notification.error("Failed to request browser notification permission");
    }
  }, []);

  if (!address) {
    return (
      <div className="surface-card rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-primary">
              <BellAlertIcon className="h-4 w-4" />
              Notifications
            </div>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Notification settings</h1>
            <p className="mt-3 text-base text-base-content/60">
              Connect your wallet to choose which in-app and browser alerts you want to receive.
            </p>
          </div>
          <button
            type="button"
            onClick={openConnectModal}
            className="btn border-none bg-white px-6 text-black hover:bg-gray-200"
          >
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
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">Notification settings</h1>
            <p className="mt-3 text-base text-base-content/60">
              Choose which alerts should appear in-app and through browser notifications. Email delivery will live here
              too once it is enabled.
            </p>
          </div>
          <div className="rounded-2xl border border-base-content/10 bg-base-content/[0.03] px-4 py-3 text-sm text-base-content/60">
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
            <h2 className="text-xl font-semibold text-white">In-app and browser alerts</h2>
            <p className="mt-1 text-sm text-base-content/55">
              These preferences control the live alerts shown while you are using Curyo.
            </p>
          </div>
          {browserPermission === "default" ? (
            <button type="button" onClick={() => void requestBrowserPermission()} className="btn btn-outline btn-sm">
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
    </div>
  );
}
