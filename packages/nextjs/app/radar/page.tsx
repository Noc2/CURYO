"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ArrowTopRightOnSquareIcon, BellAlertIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import {
  DiscoverModuleCard,
  EmptyDiscoverModule,
  FeaturedTodayPanel,
  SettlingSoonPanel,
  SuggestedCuratorsPanel,
  formatRelativeTime,
} from "~~/components/discover/DiscoverPanels";
import { useCurrentSeasons } from "~~/hooks/useCurrentSeasons";
import { useFeaturedToday } from "~~/hooks/useFeaturedToday";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { type NotificationPreferences, useNotificationPreferences } from "~~/hooks/useNotificationPreferences";
import { useRadarFeed } from "~~/hooks/useRadarFeed";
import { type PonderRadarResolutionItem, type PonderRadarSubmissionItem } from "~~/services/ponder/client";
import { notification } from "~~/utils/scaffold-eth";

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
  const { radar, isLoading, watchedCount, followedCategoryCount } = useRadarFeed(address);
  const { items: featuredToday } = useFeaturedToday(4);
  const { seasons } = useCurrentSeasons(address);
  const { followedWallets, toggleFollow, isPending } = useFollowedProfiles(address);
  const seasonDescription =
    Number(seasons.endsAt) > 0
      ? `Current standings. This week resets ${formatRelativeTime(seasons.endsAt)}.`
      : "Current standings for the live weekly season.";
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
                {followedCategoryCount} categories
              </div>
              <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base text-base-content/60">
                {radar.settlingSoon.length} settling soon
              </div>
            </div>
          </div>
        </section>

        <FeaturedTodayPanel items={featuredToday} />

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <SettlingSoonPanel items={radar.settlingSoon} isLoading={isLoading} />

            <DiscoverModuleCard
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
                <EmptyDiscoverModule message="Follow a few curators from profiles or leaderboards to turn this into a live activity stream." />
              )}
            </DiscoverModuleCard>

            <DiscoverModuleCard
              title="From Categories You Follow"
              description="New content arriving in the topics you explicitly care about."
            >
              {radar.followedCategoryContent.length > 0 ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {radar.followedCategoryContent.map(item => (
                    <ContentCard
                      key={`${item.categoryId}-${item.contentId}`}
                      item={item}
                      eyebrow="Followed category"
                      meta={formatRelativeTime(item.createdAt)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyDiscoverModule message="Follow a category from Discover to see new items from that topic here." />
              )}
            </DiscoverModuleCard>

            <DiscoverModuleCard
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
                <EmptyDiscoverModule message="Once followed curators have resolved calls, their recent form will show up here." />
              )}
            </DiscoverModuleCard>
          </div>

          <div className="space-y-6">
            <DiscoverModuleCard title="This Week's Season" description={seasonDescription}>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary/80">
                    {seasons.global.label}
                  </div>
                  {seasons.global.standings.length > 0 ? (
                    <div className="space-y-2">
                      {seasons.global.standings.slice(0, 3).map(item => (
                        <div
                          key={`global-${item.voter}`}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-base-content/10 bg-base-content/[0.03] px-4 py-3"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="text-sm font-semibold text-base-content/45">#{item.rank}</span>
                            <SubmitterBadge
                              address={item.voter}
                              username={item.profileName}
                              profileImageUrl={item.profileImageUrl}
                              showAddress={Boolean(item.profileName)}
                            />
                          </div>
                          <div className="shrink-0 text-sm text-base-content/55">
                            {item.wins}W / {item.losses}L
                          </div>
                        </div>
                      ))}
                      {seasons.global.me ? (
                        <div className="rounded-2xl bg-primary/10 px-4 py-3 text-sm text-primary">
                          You are #{seasons.global.me.rank} this week at {Math.round(seasons.global.me.winRate * 100)}%
                          .
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyDiscoverModule message="Season standings will fill in as this week's settled rounds come in." />
                  )}
                </div>

                {seasons.category ? (
                  <div>
                    <div className="mb-2 text-sm font-semibold uppercase tracking-wide text-primary/80">
                      {seasons.category.categoryName || "Featured category"} season
                    </div>
                    {seasons.category.standings.length > 0 ? (
                      <div className="space-y-2">
                        {seasons.category.standings.slice(0, 3).map(item => (
                          <div
                            key={`category-${item.voter}`}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-base-content/10 bg-base-content/[0.03] px-4 py-3"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="text-sm font-semibold text-base-content/45">#{item.rank}</span>
                              <SubmitterBadge
                                address={item.voter}
                                username={item.profileName}
                                profileImageUrl={item.profileImageUrl}
                                showAddress={Boolean(item.profileName)}
                              />
                            </div>
                            <div className="shrink-0 text-sm text-base-content/55">
                              {item.wins}W / {item.losses}L
                            </div>
                          </div>
                        ))}
                        {seasons.category.me ? (
                          <div className="rounded-2xl bg-base-content/[0.06] px-4 py-3 text-sm text-base-content/65">
                            Your {seasons.category.categoryName || "category"} rank: #{seasons.category.me.rank}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <EmptyDiscoverModule message="Category-season standings will appear once that category has resolved rounds this week." />
                    )}
                  </div>
                ) : null}
              </div>
            </DiscoverModuleCard>

            <DiscoverModuleCard
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
            </DiscoverModuleCard>

            <SuggestedCuratorsPanel
              items={radar.suggestedCurators}
              followedWallets={followedWallets}
              isPending={isPending}
              onToggleFollow={handleToggleFollow}
            />

            <DiscoverModuleCard
              title="Start Here"
              description="Fresh content to review when your own radar is still sparse."
            >
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
                <EmptyDiscoverModule message="Recommended content will appear here as soon as there is new activity to surface." />
              )}
            </DiscoverModuleCard>
          </div>
        </div>
      </div>
    </div>
  );
}
