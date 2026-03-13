"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { blo } from "blo";
import { BellAlertIcon, EnvelopeIcon, ShieldCheckIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import {
  countEnabledEmailPreferences,
  countEnabledPreferences,
  useSettingsOverview,
} from "~~/hooks/useSettingsOverview";

type SettingsSummaryTab = "profile" | "delegation" | "notifications";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function maskEmail(email: string) {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return email;
  const visible = localPart.slice(0, Math.min(localPart.length, 2));
  return `${visible}${"•".repeat(Math.max(localPart.length - visible.length, 2))}@${domain}`;
}

function statusBadgeClass(tone: "success" | "warning" | "info" | "neutral") {
  if (tone === "success") return "badge badge-success";
  if (tone === "warning") return "badge badge-warning";
  if (tone === "info") return "badge badge-info";
  return "badge badge-neutral";
}

function SummaryTile({
  icon: Icon,
  label,
  status,
  tone,
  description,
  detail,
  actionLabel,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  status: string;
  tone: "success" | "warning" | "info" | "neutral";
  description: string;
  detail?: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel}
      className="group rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4 text-left transition hover:border-primary/30 hover:bg-base-content/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-base-100 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <span className={`${statusBadgeClass(tone)} badge-sm whitespace-nowrap`}>{status}</span>
      </div>
      <div className="mt-4 space-y-2">
        <h2 className="text-lg font-semibold text-white">{label}</h2>
        <p className="text-sm text-base-content/60">{description}</p>
        {detail ? <p className="font-mono text-xs text-base-content/45 break-all">{detail}</p> : null}
        <p className="pt-1 text-sm font-medium text-primary transition-colors group-hover:text-white">{actionLabel}</p>
      </div>
    </button>
  );
}

export function SettingsAccountSummary({
  address,
  refreshNonce,
  onSelectTab,
}: {
  address: `0x${string}`;
  refreshNonce: number;
  onSelectTab: (tab: SettingsSummaryTab) => void;
}) {
  const {
    browserPermission,
    hasVoterId,
    tokenId,
    isIdentityLoading,
    profile,
    hasProfile,
    isProfileLoading,
    delegation,
    hasNotificationReadSession,
    notificationPreferences,
    isNotificationSummaryLoading,
    hasEmailReadSession,
    emailSettings,
    isEmailSummaryLoading,
  } = useSettingsOverview(address, refreshNonce);

  const displayName = hasProfile && profile?.name ? profile.name : truncateAddress(address);

  const profileTile = (() => {
    if (isIdentityLoading || isProfileLoading) {
      return {
        status: "Checking",
        tone: "neutral" as const,
        description: "Reading your identity and profile state from the protocol.",
        detail: undefined,
      };
    }

    if (hasProfile) {
      return {
        status: "Live",
        tone: "success" as const,
        description: "Your public curator profile is active and editable from here.",
        detail: profile?.name ? `Public name: ${profile.name}` : undefined,
      };
    }

    if (hasVoterId) {
      return {
        status: "Ready",
        tone: "info" as const,
        description: "Your Voter ID is active. The next step is creating your public profile.",
        detail: tokenId > 0n ? `Voter ID #${tokenId.toString()}` : undefined,
      };
    }

    return {
      status: "Voter ID required",
      tone: "warning" as const,
      description: "Verify with Self.xyz before you can create a public profile.",
      detail: undefined,
    };
  })();

  const delegationTile = (() => {
    if (delegation.isLoading) {
      return {
        status: "Checking",
        tone: "neutral" as const,
        description: "Loading delegate assignments for this wallet.",
        detail: undefined,
      };
    }

    if (delegation.hasDelegate) {
      return {
        status: "Delegate set",
        tone: "success" as const,
        description: "A secondary wallet can vote and submit on behalf of your Voter ID.",
        detail: delegation.delegateTo,
      };
    }

    if (delegation.isDelegate) {
      return {
        status: "Acting as delegate",
        tone: "info" as const,
        description: "This wallet is currently authorized to act for another holder.",
        detail: delegation.delegateOf,
      };
    }

    return {
      status: "No delegate",
      tone: "neutral" as const,
      description: "No secondary voting wallet is currently authorized.",
      detail: undefined,
    };
  })();

  const notificationsTile = (() => {
    if (isNotificationSummaryLoading) {
      return {
        status: "Checking",
        tone: "neutral" as const,
        description: "Checking browser permission and whether your alert preferences are unlocked.",
        detail: undefined,
      };
    }

    if (!hasNotificationReadSession || !notificationPreferences) {
      const permissionLabel =
        browserPermission === "granted"
          ? "Browser ready"
          : browserPermission === "denied"
            ? "Browser blocked"
            : browserPermission === "unsupported"
              ? "Browser unsupported"
              : "Permission pending";

      return {
        status: "Private",
        tone: browserPermission === "denied" ? ("warning" as const) : ("neutral" as const),
        description: "Unlock the Notifications tab to load your private alert preferences for this wallet.",
        detail: permissionLabel,
      };
    }

    const enabledCount = countEnabledPreferences(notificationPreferences);
    if (enabledCount === 0) {
      return {
        status: "Off",
        tone: "neutral" as const,
        description: "All tracked in-app alert types are currently disabled.",
        detail:
          browserPermission === "granted"
            ? "Browser notifications allowed"
            : browserPermission === "denied"
              ? "Browser notifications blocked"
              : "Browser permission not granted",
      };
    }

    if (browserPermission === "denied") {
      return {
        status: "Browser blocked",
        tone: "warning" as const,
        description: `${enabledCount} alert types are enabled in-app, but this browser is blocking push-style notifications.`,
        detail: `${enabledCount} alert types on`,
      };
    }

    if (browserPermission === "default") {
      return {
        status: "Permission pending",
        tone: "info" as const,
        description: `${enabledCount} alert types are enabled. Grant browser permission if you want native notifications too.`,
        detail: `${enabledCount} alert types on`,
      };
    }

    return {
      status: "Enabled",
      tone: "success" as const,
      description: `${enabledCount} alert types are enabled for this wallet.`,
      detail: browserPermission === "granted" ? "Browser notifications allowed" : "In-app alerts only",
    };
  })();

  const emailTile = (() => {
    if (isEmailSummaryLoading) {
      return {
        status: "Checking",
        tone: "neutral" as const,
        description: "Checking whether your notification email is unlocked and verified.",
        detail: undefined,
      };
    }

    if (!hasEmailReadSession || !emailSettings) {
      return {
        status: "Private",
        tone: "neutral" as const,
        description: "Unlock the Notifications tab to view or change your email delivery state.",
        detail: undefined,
      };
    }

    if (!emailSettings.email.trim()) {
      return {
        status: "Not added",
        tone: "neutral" as const,
        description: "No email address is connected for notification delivery yet.",
        detail: undefined,
      };
    }

    const enabledCount = countEnabledEmailPreferences(emailSettings);
    if (emailSettings.verified) {
      return {
        status: "Verified",
        tone: "success" as const,
        description:
          enabledCount > 0
            ? `${enabledCount} email alert types can be delivered to your verified address.`
            : "Your email is verified, but no email alert types are currently enabled.",
        detail: maskEmail(emailSettings.email),
      };
    }

    return {
      status: "Needs verification",
      tone: "warning" as const,
      description: "Confirm the verification email before Curyo can send notifications there.",
      detail: maskEmail(emailSettings.email),
    };
  })();

  return (
    <section className="surface-card rounded-3xl p-6 sm:p-8 space-y-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <img
            src={blo(address)}
            alt={`${displayName} wallet avatar`}
            width={72}
            height={72}
            className="h-[72px] w-[72px] rounded-3xl border border-base-content/10 object-cover"
          />
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-primary">
              Account Overview
            </div>
            <div>
              <h1 className="text-3xl font-semibold text-white sm:text-4xl">Settings</h1>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-base-content/70">Current wallet</p>
              <p className="font-mono text-sm text-base-content/55 break-all">{address}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:max-w-sm lg:justify-end">
          <span className="badge badge-success badge-sm">Connected</span>
          <span className={`badge badge-sm ${hasVoterId ? "badge-info" : "badge-warning"}`}>
            {hasVoterId ? `Voter ID #${tokenId.toString()}` : "No Voter ID"}
          </span>
          {hasProfile ? (
            <Link
              href={`/profiles/${address.toLowerCase()}`}
              className="inline-flex items-center justify-center rounded-full bg-base-100 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-base-300"
            >
              Open public profile
            </Link>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          icon={UserCircleIcon}
          label="Profile"
          status={profileTile.status}
          tone={profileTile.tone}
          description={profileTile.description}
          detail={profileTile.detail}
          actionLabel="Open profile settings"
          onClick={() => onSelectTab("profile")}
        />
        <SummaryTile
          icon={ShieldCheckIcon}
          label="Delegation"
          status={delegationTile.status}
          tone={delegationTile.tone}
          description={delegationTile.description}
          detail={delegationTile.detail}
          actionLabel="Open delegation settings"
          onClick={() => onSelectTab("delegation")}
        />
        <SummaryTile
          icon={BellAlertIcon}
          label="Notifications"
          status={notificationsTile.status}
          tone={notificationsTile.tone}
          description={notificationsTile.description}
          detail={notificationsTile.detail}
          actionLabel="Open notification settings"
          onClick={() => onSelectTab("notifications")}
        />
        <SummaryTile
          icon={EnvelopeIcon}
          label="Email"
          status={emailTile.status}
          tone={emailTile.tone}
          description={emailTile.description}
          detail={emailTile.detail}
          actionLabel="Manage email delivery"
          onClick={() => onSelectTab("notifications")}
        />
      </div>

      {!hasVoterId ? (
        <div className="rounded-2xl border border-warning/20 bg-warning/10 px-4 py-3 text-sm text-base-content/75">
          Profile creation is gated by Voter ID verification. Once you verify in Governance, this page becomes your
          control center for identity, delegation, and alerting.
        </div>
      ) : null}
    </section>
  );
}
