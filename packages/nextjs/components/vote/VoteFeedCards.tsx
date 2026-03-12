"use client";

import type { CSSProperties } from "react";
import { memo, useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { WatchContentButton } from "~~/components/shared/WatchContentButton";
import { SwipeCard } from "~~/components/swipe/SwipeCard";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";
import { detectPlatform } from "~~/utils/platforms";

const PROXYABLE_THUMBNAIL_HOSTS = new Set([
  "coin-images.coingecko.com",
  "assets.coingecko.com",
  "image.tmdb.org",
  "upload.wikimedia.org",
  "cdn-avatars.huggingface.co",
  "pbs.twimg.com",
  "media.rawg.io",
  "avatars.githubusercontent.com",
  "api.scryfall.com",
  "cards.scryfall.io",
  "img.youtube.com",
  "i.ytimg.com",
]);

function getDomainLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getThumbnailImageSrc(thumbnailUrl: string) {
  try {
    const parsed = new URL(thumbnailUrl);
    if (parsed.protocol === "https:" && PROXYABLE_THUMBNAIL_HOSTS.has(parsed.hostname)) {
      return `/api/image-proxy?url=${encodeURIComponent(thumbnailUrl)}`;
    }
  } catch {
    return thumbnailUrl;
  }
  return thumbnailUrl;
}

const STAGE_PALETTES = [
  {
    surface: "rgba(30, 22, 18, 0.96)",
    accent: "rgb(217 100 30)",
    accentSoft: "rgba(217, 100, 30, 0.26)",
    glow: "rgba(217, 100, 30, 0.34)",
  },
  {
    surface: "rgba(16, 25, 37, 0.96)",
    accent: "rgb(56 189 248)",
    accentSoft: "rgba(56, 189, 248, 0.22)",
    glow: "rgba(56, 189, 248, 0.32)",
  },
  {
    surface: "rgba(18, 31, 34, 0.96)",
    accent: "rgb(45 212 191)",
    accentSoft: "rgba(45, 212, 191, 0.22)",
    glow: "rgba(45, 212, 191, 0.3)",
  },
  {
    surface: "rgba(38, 28, 16, 0.96)",
    accent: "rgb(250 204 21)",
    accentSoft: "rgba(250, 204, 21, 0.22)",
    glow: "rgba(250, 204, 21, 0.3)",
  },
  {
    surface: "rgba(28, 20, 37, 0.96)",
    accent: "rgb(192 132 252)",
    accentSoft: "rgba(192, 132, 252, 0.22)",
    glow: "rgba(192, 132, 252, 0.3)",
  },
] as const;

function getVoteStagePalette(item: ContentItem) {
  const paletteIndex = Number((item.categoryId || item.id) % BigInt(STAGE_PALETTES.length));
  return STAGE_PALETTES[paletteIndex];
}

export function getVoteFeedThumbnailSrc(item: ContentItem) {
  const platform = detectPlatform(item.url);
  const thumbnailUrl = item.thumbnailUrl ?? platform.thumbnailUrl;
  return thumbnailUrl ? getThumbnailImageSrc(thumbnailUrl) : null;
}

interface FeedVoteCardProps {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  onVote: (item: ContentItem, isUp: boolean) => void;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  watched: boolean;
  watchPending: boolean;
  following: boolean;
  followPending: boolean;
  normalizedAddress?: string;
  isCommitting: boolean;
  voteError?: string | null;
  address?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
}

export const FeedVoteCard = memo(function FeedVoteCard({
  item,
  submitterProfile,
  onVote,
  onToggleWatch,
  onToggleFollow,
  watched,
  watchPending,
  following,
  followPending,
  normalizedAddress,
  isCommitting,
  voteError,
  address,
  onPrevious,
  onNext,
  canPrevious = false,
  canNext = false,
}: FeedVoteCardProps) {
  const palette = getVoteStagePalette(item);
  const stageStyle = {
    "--vote-stage-surface": palette.surface,
    "--vote-stage-accent": palette.accent,
    "--vote-stage-accent-soft": palette.accentSoft,
    "--vote-stage-glow": palette.glow,
    background:
      "radial-gradient(circle at top right, var(--vote-stage-glow), transparent 38%), linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.015)), var(--vote-stage-surface)",
  } as CSSProperties;

  return (
    <div
      className="vote-stage-shell surface-card relative h-full min-h-0 overflow-hidden rounded-[1.75rem] p-3 ring-1 ring-white/10"
      style={stageStyle}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-y-0 left-[-12%] w-[62%] -skew-x-12 bg-[linear-gradient(160deg,var(--vote-stage-accent-soft),transparent_72%)] blur-xl" />
        <div className="absolute inset-y-4 left-[-2%] w-[48%] -skew-x-12 rounded-[2rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
        <div className="absolute right-5 top-5 h-24 w-16 -skew-x-12 rounded-[1.75rem] border border-white/10 bg-[var(--vote-stage-accent)] shadow-[0_0_32px_var(--vote-stage-glow)] xl:h-36 xl:w-24" />
        <div className="absolute right-9 top-2 h-24 w-16 -skew-x-12 rounded-[1.75rem] bg-[var(--vote-stage-glow)] blur-sm xl:h-36 xl:w-24" />
        <div className="absolute right-14 top-[-0.5rem] h-24 w-16 -skew-x-12 rounded-[1.75rem] bg-[var(--vote-stage-accent-soft)] blur-md xl:h-36 xl:w-24" />
      </div>

      <div className="absolute inset-y-0 left-0 z-20 flex items-center pl-2 sm:pl-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Select previous card"
          className="btn btn-circle btn-sm border-none bg-black/35 text-white shadow-[0_0_24px_rgba(0,0,0,0.25)] backdrop-blur hover:bg-black/55 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-white/30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="absolute inset-y-0 right-0 z-20 flex items-center pr-2 sm:pr-3">
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Select next card"
          className="btn btn-circle btn-sm border-none bg-black/35 text-white shadow-[0_0_24px_rgba(0,0,0,0.25)] backdrop-blur hover:bg-black/55 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-white/30"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-[linear-gradient(180deg,rgba(0,0,0,0.25),transparent)]" />

      <div className="relative z-10">
        <div className="mb-3 flex items-center justify-between gap-3 text-sm text-base-content/45">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-base-content/[0.05] px-2.5 py-1 font-medium text-base-content/60">
              {detectPlatform(item.url).type}
            </span>
            {item.tags[0] ? <span className="text-base-content/35">#{item.tags[0]}</span> : null}
          </div>
          <span className="rounded-full bg-primary/12 px-2.5 py-1 font-medium text-primary">Now Voting</span>
        </div>

        <div className="flex min-h-0 flex-col gap-3 lg:h-[min(52vh,34rem)] lg:flex-row lg:items-stretch xl:h-full">
          <div
            className="w-full overflow-hidden rounded-2xl lg:min-h-0 lg:w-3/5"
            style={{ background: "var(--color-base-300)" }}
          >
            <SwipeCard
              content={item}
              submitterProfile={submitterProfile}
              isTop
              index={0}
              canVote={!!address}
              standalone
              embedded
              enableSwipeVote={false}
              submitterAction={
                normalizedAddress && item.submitter.toLowerCase() === normalizedAddress ? null : (
                  <FollowProfileButton
                    following={following}
                    pending={followPending}
                    onClick={() => onToggleFollow(item.submitter)}
                  />
                )
              }
              headerActions={
                <WatchContentButton watched={watched} pending={watchPending} onClick={() => onToggleWatch(item.id)} />
              }
            />
          </div>

          <div className="w-full rounded-2xl lg:min-h-0 lg:w-2/5" style={{ background: "var(--color-base-300)" }}>
            <VotingQuestionCard
              contentId={item.id}
              categoryId={item.categoryId}
              onVote={isUp => onVote(item, isUp)}
              isCommitting={isCommitting}
              address={address}
              error={voteError}
              isOwnContent={item.isOwnContent}
              embedded
            />
          </div>
        </div>
      </div>
    </div>
  );
});

interface FeedQueueCardProps {
  item: ContentItem;
  onSelect: (id: bigint, categoryId: bigint) => void;
  submitterProfile?: SubmitterProfile;
  queuePosition: number;
  selected: boolean;
}

export const FeedQueueCard = memo(function FeedQueueCard({
  item,
  onSelect,
  submitterProfile,
  queuePosition,
  selected,
}: FeedQueueCardProps) {
  const platform = detectPlatform(item.url);
  const [imageError, setImageError] = useState(false);
  const thumbnailSrc = getVoteFeedThumbnailSrc(item);

  return (
    <button
      type="button"
      data-testid="content-thumbnail"
      data-thumbnail-id={item.id.toString()}
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(item.id, item.categoryId)}
      className={`group w-full cursor-pointer overflow-hidden rounded-xl border text-left transition-colors xl:w-[12.75rem] xl:flex-shrink-0 xl:snap-start ${
        selected
          ? "border-primary bg-primary/[0.08] ring-2 ring-primary/35 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
          : "border-base-content/10 bg-base-content/[0.03] hover:border-primary/30 hover:bg-base-content/[0.05]"
      }`}
    >
      <div className="relative aspect-video cursor-pointer overflow-hidden bg-base-200 xl:aspect-[16/10]">
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {queuePosition + 1}
          </span>
          {selected ? (
            <span className="rounded-full bg-primary/90 px-2.5 py-1 text-xs font-semibold text-primary-content">
              Selected
            </span>
          ) : null}
        </div>
        {thumbnailSrc && !imageError ? (
          <img
            src={thumbnailSrc}
            alt=""
            className="h-full w-full cursor-pointer object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            loading="lazy"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-full w-full cursor-pointer items-end bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_transparent_55%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">{platform.type}</p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-white/90">{item.goal}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1.5 p-2.5 xl:space-y-1 xl:p-2">
        <div className="flex items-center gap-2 text-xs text-base-content/55">
          <span className="font-medium uppercase tracking-wide">{selected ? "Selected" : "Card"}</span>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-white/90 xl:text-[0.82rem]">{item.goal}</p>
        <div className="flex items-center gap-2 text-xs text-base-content/50 xl:flex-wrap xl:gap-1.5">
          <span className="rounded-full bg-base-content/[0.05] px-2 py-1 font-medium text-base-content/65">
            {platform.type}
          </span>
          {item.tags[0] ? <span className="truncate xl:hidden">#{item.tags[0]}</span> : null}
          <span className="hidden truncate sm:inline xl:hidden">{getDomainLabel(item.url)}</span>
        </div>
        <div className="text-xs text-base-content/55 xl:hidden">
          <span className="block min-w-0 truncate">{submitterProfile?.username ?? item.submitter}</span>
        </div>
      </div>
    </button>
  );
});
