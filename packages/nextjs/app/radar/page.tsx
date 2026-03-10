"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ArrowTopRightOnSquareIcon, BellAlertIcon, ClockIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { type NotificationPreferences, useNotificationPreferences } from "~~/hooks/useNotificationPreferences";
import { useRadarFeed } from "~~/hooks/useRadarFeed";
import {
  type PonderRadarResolutionItem,
  type PonderRadarSettlingItem,
  type PonderRadarSubmissionItem,
} from "~~/services/ponder/client";
import { notification } from "~~/utils/scaffold-eth";

function formatRelativeTime(timestamp: string | null | undefined) {
  if (!timestamp) return "Unknown";

  const now = Math.floor(Date.now() / 1000);
  const target = Number(timestamp);
  const diff = target - now;
  const abs = Math.abs(diff);

  if (abs < 60) return diff >= 0 ? "in under a minute" : "just now";

  const minutes = Math.round(abs / 60);
  if (minutes < 60) return diff >= 0 ? `in ${minutes}m` : `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;

  const days = Math.round(hours / 24);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}

function getDomainLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getResolutionStyle(item: PonderRadarResolutionItem) {
  switch (item.outcome) {
    case "won":
      return { label: "Won", className: "text-success bg-success/10" };
    case "lost":
      return { label: "Lost", className: "text-error bg-error/10" };
    case "tied":
      return { label: "Tied", className: "text-warning bg-warning/10" };
    case "cancelled":
      return { label: "Cancelled", className: "text-base-content/60 bg-base-content/10" };
    case "reveal_failed":
      return { label: "Reveal failed", className: "text-warning bg-warning/10" };
    default:
      return { label: "Resolved", className: "text-primary bg-primary/10" };
  }
}

function ModuleCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card rounded-3xl p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-semibold">{title}</h2>
        <p className="mt-1 text-base text-base-content/55">{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyModule({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-base-content/10 bg-base-content/[0.03] px-4 py-6 text-base text-base-content/50">
      {message}
    </div>
  );
}

function ContentCard({ item, eyebrow, meta }: { item: PonderRadarSubmissionItem; eyebrow: string; meta: string }) {
  return (
    <Link
      href={`/vote?content=${item.contentId}`}
      className="group flex flex-col gap-3 rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4 transition-colors hover:border-primary/30 hover:bg-base-content/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary/80">{eyebrow}</p>
          <h3 className="mt-1 text-lg font-semibold leading-snug text-white group-hover:text-primary">{item.goal}</h3>
        </div>
        <ArrowTopRightOnSquareIcon className="mt-1 h-4 w-4 shrink-0 text-base-content/35 transition-colors group-hover:text-primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/45">
        <span>{getDomainLabel(item.url)}</span>
        <span>•</span>
        <span>{meta}</span>
      </div>

      <SubmitterBadge
        address={item.submitter}
        username={item.profileName}
        profileImageUrl={item.profileImageUrl}
        showAddress={Boolean(item.profileName)}
      />
    </Link>
  );
}

function SettlingSoonCard({ item }: { item: PonderRadarSettlingItem }) {
  const sourceLabel =
    item.source === "watched_voted" ? "Watching + voted" : item.source === "watched" ? "Watching" : "You voted";

  return (
    <Link
      href={`/vote?content=${item.contentId}`}
      className="group flex flex-col gap-3 rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4 transition-colors hover:border-primary/30 hover:bg-base-content/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              {sourceLabel}
            </span>
            <span className="rounded-full bg-base-content/10 px-2 py-1 text-xs text-base-content/55">
              Round #{item.roundId}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-snug text-white group-hover:text-primary">{item.goal}</h3>
        </div>
        <ClockIcon className="mt-1 h-4 w-4 shrink-0 text-base-content/35" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/45">
        <span>{getDomainLabel(item.url)}</span>
        <span>•</span>
        <span>
          {item.estimatedSettlementTime ? `est. ${formatRelativeTime(item.estimatedSettlementTime)}` : "open now"}
        </span>
      </div>

      <SubmitterBadge
        address={item.submitter}
        username={item.profileName}
        profileImageUrl={item.profileImageUrl}
        showAddress={Boolean(item.profileName)}
      />
    </Link>
  );
}

function ResolutionCard({ item }: { item: PonderRadarResolutionItem }) {
  const status = getResolutionStyle(item);

  return (
    <Link
      href={`/vote?content=${item.contentId}`}
      className="group flex flex-col gap-3 rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4 transition-colors hover:border-primary/30 hover:bg-base-content/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${status.className}`}>
            {status.label}
          </div>
          <h3 className="mt-2 text-lg font-semibold leading-snug text-white group-hover:text-primary">{item.goal}</h3>
        </div>
        <span className="text-sm text-base-content/45">{formatRelativeTime(item.settledAt)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/45">
        <span>{getDomainLabel(item.url)}</span>
        <span>•</span>
        <span>{item.isUp === null ? "Hidden vote" : item.isUp ? "Voted up" : "Voted down"}</span>
      </div>

      <SubmitterBadge
        address={item.voter}
        username={item.profileName}
        profileImageUrl={item.profileImageUrl}
        showAddress={Boolean(item.profileName)}
      />
    </Link>
  );
}

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

export default function RadarPage() {
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { radar, isLoading, watchedCount } = useRadarFeed(address);
  const { followedWallets, toggleFollow, isPending } = useFollowedProfiles(address);
  const { preferences, isSaving, updatePreference } = useNotificationPreferences(address);

  const handleToggleFollow = useCallback(
    async (targetAddress: string) => {
      const result = await toggleFollow(targetAddress);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Connect your wallet to follow curators.");
          openConnectModal?.();
          return;
        }

        if (result.reason === "self_follow" || result.reason === "rejected") {
          return;
        }

        notification.error(result.error || "Failed to update follows");
        return;
      }

      notification.success(result.following ? "Following curator" : "Unfollowed curator");
    },
    [openConnectModal, toggleFollow],
  );

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

  if (!address) {
    return (
      <div className="flex flex-col items-center grow px-4 pt-10 pb-12">
        <div className="w-full max-w-4xl surface-card rounded-3xl p-8 sm:p-10">
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <div className="mb-4 rounded-full bg-primary/10 p-4 text-primary">
              <BellAlertIcon className="h-8 w-8" />
            </div>
            <h1 className="text-4xl font-semibold sm:text-5xl">Radar</h1>
            <p className="mt-4 text-lg text-base-content/60">
              Keep up with watched rounds, curators you follow, and the best things to review next.
            </p>
            <button
              type="button"
              onClick={openConnectModal}
              className="btn mt-8 border-none bg-white px-6 text-black hover:bg-gray-200"
            >
              Connect wallet
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-6xl space-y-6">
        <section className="surface-card rounded-3xl p-6 sm:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold uppercase tracking-wide text-primary">
                <SparklesIcon className="h-4 w-4" />
                Daily radar
              </div>
              <h1 className="mt-3 text-4xl font-semibold sm:text-5xl">What matters now</h1>
              <p className="mt-3 max-w-3xl text-lg text-base-content/60">
                Follow the rounds you are watching, catch up on curator activity, and jump into the next things worth
                checking.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base text-base-content/60">
                {radar.followingCount} following
              </div>
              <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base text-base-content/60">
                {watchedCount} watched
              </div>
              <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base text-base-content/60">
                {radar.settlingSoon.length} settling soon
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <ModuleCard
              title="Settling Soon"
              description="Rounds you are tracking or voted in, sorted by the earliest likely settlement window."
            >
              {isLoading ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <div key={index} className="h-40 animate-pulse rounded-2xl bg-base-content/[0.05]" />
                  ))}
                </div>
              ) : radar.settlingSoon.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {radar.settlingSoon.map(item => (
                    <SettlingSoonCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyModule message="Watch content or vote on a few rounds and they will show up here before they resolve." />
              )}
            </ModuleCard>

            <ModuleCard
              title="From Curators You Follow"
              description="Fresh submissions from the people you chose to keep an eye on."
            >
              {radar.followedSubmissions.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {radar.followedSubmissions.map(item => (
                    <ContentCard
                      key={`${item.contentId}-${item.createdAt}`}
                      item={item}
                      eyebrow="New submission"
                      meta={formatRelativeTime(item.createdAt)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyModule message="Follow a few curators from profiles or leaderboards to turn this into a live activity stream." />
              )}
            </ModuleCard>

            <ModuleCard
              title="Recent Curator Outcomes"
              description="How the curators you follow have been doing on recently resolved rounds."
            >
              {radar.followedResolutions.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {radar.followedResolutions.map(item => (
                    <ResolutionCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <EmptyModule message="Once followed curators have resolved calls, their recent form will show up here." />
              )}
            </ModuleCard>
          </div>

          <div className="space-y-6">
            <ModuleCard
              title="Notification Settings"
              description="Choose which radar events should trigger in-app and browser notifications."
            >
              <div className="space-y-3">
                <NotificationPreferenceToggle
                  label="Round resolved"
                  description="Notify when content you watched or voted on resolves."
                  checked={preferences.roundResolved}
                  disabled={isSaving}
                  onChange={checked => {
                    void handleTogglePreference("roundResolved", checked);
                  }}
                />
                <NotificationPreferenceToggle
                  label="Settling within 1 hour"
                  description="Get a heads-up when tracked rounds look close to settlement."
                  checked={preferences.settlingSoonHour}
                  disabled={isSaving}
                  onChange={checked => {
                    void handleTogglePreference("settlingSoonHour", checked);
                  }}
                />
                <NotificationPreferenceToggle
                  label="Settling today"
                  description="See a broader daily reminder for watched or voted rounds."
                  checked={preferences.settlingSoonDay}
                  disabled={isSaving}
                  onChange={checked => {
                    void handleTogglePreference("settlingSoonDay", checked);
                  }}
                />
                <NotificationPreferenceToggle
                  label="Followed curator submissions"
                  description="Notify when someone you follow submits new content."
                  checked={preferences.followedSubmission}
                  disabled={isSaving}
                  onChange={checked => {
                    void handleTogglePreference("followedSubmission", checked);
                  }}
                />
                <NotificationPreferenceToggle
                  label="Followed curator outcomes"
                  description="Notify when a followed curator has a round resolve."
                  checked={preferences.followedResolution}
                  disabled={isSaving}
                  onChange={checked => {
                    void handleTogglePreference("followedResolution", checked);
                  }}
                />
              </div>
            </ModuleCard>

            <ModuleCard
              title="Suggested Curators"
              description="A few active curators worth following so your radar becomes more useful."
            >
              {radar.suggestedCurators.length > 0 ? (
                <div className="space-y-3">
                  {radar.suggestedCurators.map(item => (
                    <div
                      key={item.address}
                      className="flex flex-col gap-3 rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <SubmitterBadge
                          address={item.address}
                          username={item.profileName}
                          profileImageUrl={item.profileImageUrl}
                          showAddress={Boolean(item.profileName)}
                          winRate={item.winRate}
                          totalSettledVotes={item.totalSettledVotes}
                        />
                        <FollowProfileButton
                          following={followedWallets.has(item.address.toLowerCase())}
                          pending={isPending(item.address)}
                          onClick={() => {
                            void handleToggleFollow(item.address);
                          }}
                          variant="pill"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm text-base-content/45">
                        <span>{item.totalSettledVotes} settled votes</span>
                        <span>•</span>
                        <span>{Math.round(item.winRate * 100)}% win rate</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyModule message="Suggested curators will appear here once enough recent activity is indexed." />
              )}
            </ModuleCard>

            <ModuleCard title="Start Here" description="Fresh content to review when your own radar is still sparse.">
              {radar.recommendedContent.length > 0 ? (
                <div className="space-y-3">
                  {radar.recommendedContent.map(item => (
                    <ContentCard
                      key={`${item.contentId}-${item.createdAt}`}
                      item={item}
                      eyebrow="Recommended"
                      meta={formatRelativeTime(item.createdAt)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyModule message="Recommended content will appear here as soon as there is new activity to surface." />
              )}
            </ModuleCard>
          </div>
        </div>
      </div>
    </div>
  );
}
