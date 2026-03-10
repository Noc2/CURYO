"use client";

import Link from "next/link";
import { ArrowTopRightOnSquareIcon, ClockIcon } from "@heroicons/react/24/outline";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import {
  type PonderFeaturedTodayItem,
  type PonderRadarSettlingItem,
  type PonderRadarSuggestedCurator,
} from "~~/services/ponder/client";

export function formatRelativeTime(timestamp: string | null | undefined) {
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

export function DiscoverModuleCard({
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

export function EmptyDiscoverModule({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-base-content/10 bg-base-content/[0.03] px-4 py-6 text-base text-base-content/50">
      {message}
    </div>
  );
}

function FeaturedTodayCard({ item }: { item: PonderFeaturedTodayItem }) {
  return (
    <Link
      href={`/vote?content=${item.contentId}`}
      className="group flex flex-col gap-3 rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4 transition-colors hover:border-primary/30 hover:bg-base-content/[0.05]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-primary/80">{item.featuredReason}</p>
          <h3 className="mt-1 text-lg font-semibold leading-snug text-white group-hover:text-primary">{item.goal}</h3>
        </div>
        <ArrowTopRightOnSquareIcon className="mt-1 h-4 w-4 shrink-0 text-base-content/35 transition-colors group-hover:text-primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-base-content/45">
        <span>{getDomainLabel(item.url)}</span>
        <span>•</span>
        <span>{item.voteCount} votes</span>
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

export function FeaturedTodayPanel({
  items,
  title = "Featured Today",
  description = "A few active rounds that look especially worth paying attention to right now.",
  gridClassName = "grid gap-3 md:grid-cols-2 xl:grid-cols-4",
}: {
  items: PonderFeaturedTodayItem[];
  title?: string;
  description?: string;
  gridClassName?: string;
}) {
  if (items.length === 0) return null;

  return (
    <DiscoverModuleCard title={title} description={description}>
      <div className={gridClassName}>
        {items.map(item => (
          <FeaturedTodayCard key={item.id} item={item} />
        ))}
      </div>
    </DiscoverModuleCard>
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

export function SettlingSoonPanel({
  items,
  isLoading,
  title = "Settling Soon",
  description = "Rounds you are tracking or voted in, sorted by the earliest likely settlement window.",
  emptyMessage = "Watch content or vote on a few rounds and they will show up here before they resolve.",
  gridClassName = "grid gap-3 md:grid-cols-2",
}: {
  items: PonderRadarSettlingItem[];
  isLoading?: boolean;
  title?: string;
  description?: string;
  emptyMessage?: string;
  gridClassName?: string;
}) {
  return (
    <DiscoverModuleCard title={title} description={description}>
      {isLoading ? (
        <div className={gridClassName}>
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-2xl bg-base-content/[0.05]" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <div className={gridClassName}>
          {items.map(item => (
            <SettlingSoonCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <EmptyDiscoverModule message={emptyMessage} />
      )}
    </DiscoverModuleCard>
  );
}

export function SuggestedCuratorsPanel({
  items,
  followedWallets,
  isPending,
  onToggleFollow,
  title = "Suggested Curators",
  description = "A few active curators worth following so your radar becomes more useful.",
  emptyMessage = "Suggested curators will appear here once enough recent activity is indexed.",
}: {
  items: PonderRadarSuggestedCurator[];
  followedWallets: Set<string>;
  isPending: (address: string) => boolean;
  onToggleFollow: (address: string) => void | Promise<void>;
  title?: string;
  description?: string;
  emptyMessage?: string;
}) {
  return (
    <DiscoverModuleCard title={title} description={description}>
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map(item => (
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
                    void onToggleFollow(item.address);
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
        <EmptyDiscoverModule message={emptyMessage} />
      )}
    </DiscoverModuleCard>
  );
}
