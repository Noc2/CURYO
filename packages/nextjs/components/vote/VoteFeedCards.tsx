"use client";

import { memo, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { ShareIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { MoreToggleButton } from "~~/components/shared/MoreToggleButton";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { WatchContentButton } from "~~/components/shared/WatchContentButton";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";
import { formatRatingScoreOutOfTen } from "~~/lib/ui/ratingDisplay";
import type { QueueCardStatus } from "~~/lib/vote/queueCardStatus";
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

const ShareContentModal = dynamic(
  () => import("~~/components/shared/ShareContentModal").then(m => m.ShareContentModal),
  { ssr: false },
);

const LAPTOP_VOTE_CARD_MEDIA_QUERY = "(min-width: 1024px) and (max-width: 1535px)";

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

export function getVoteFeedThumbnailSrc(item: ContentItem) {
  const platform = detectPlatform(item.url);
  const thumbnailUrl = item.contentMetadata?.thumbnailUrl ?? item.thumbnailUrl ?? platform.thumbnailUrl;
  return thumbnailUrl ? getThumbnailImageSrc(thumbnailUrl) : null;
}

interface FeedVoteCardProps {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  onVote: (item: ContentItem, isUp: boolean) => void;
  onExternalOpen?: (item: ContentItem, href: string) => void;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  watched: boolean;
  watchPending: boolean;
  following: boolean;
  followPending: boolean;
  normalizedAddress?: string;
  isCommitting: boolean;
  voteError?: string | null;
  cooldownSecondsRemaining?: number;
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
  onExternalOpen,
  onToggleWatch,
  onToggleFollow,
  watched,
  watchPending,
  following,
  followPending,
  normalizedAddress,
  isCommitting,
  voteError,
  cooldownSecondsRemaining = 0,
  address,
  onPrevious,
  onNext,
  canPrevious = false,
  canNext = false,
}: FeedVoteCardProps) {
  const [isLaptopCompact, setIsLaptopCompact] = useState(false);
  const platformType = detectPlatform(item.url).type;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(LAPTOP_VOTE_CARD_MEDIA_QUERY);
    const updateCompactMode = () => {
      setIsLaptopCompact(mediaQuery.matches);
    };

    updateCompactMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateCompactMode);
      return () => {
        mediaQuery.removeEventListener("change", updateCompactMode);
      };
    }

    mediaQuery.addListener(updateCompactMode);
    return () => {
      mediaQuery.removeListener(updateCompactMode);
    };
  }, []);

  const contentStackClassName = isLaptopCompact ? "gap-2.5" : "gap-3 xl:gap-2.5";
  const contentGridClassName = isLaptopCompact
    ? "grid min-h-0 grid-cols-1 gap-2.5 lg:grid-cols-[minmax(0,1fr)_minmax(18.75rem,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(19.5rem,22.5rem)] lg:items-stretch"
    : "grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(21rem,25rem)] lg:items-stretch";
  const usesIntrinsicMediaHeight = platformType === "youtube";
  const mediaHeightClassName = usesIntrinsicMediaHeight
    ? "w-full"
    : isLaptopCompact
      ? "w-full lg:h-[clamp(13.75rem,33vh,18.75rem)] xl:h-[clamp(14.25rem,34vh,19.5rem)]"
      : "w-full lg:h-[clamp(17rem,42vh,28rem)]";

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${contentStackClassName}`}
      onClickCapture={event => {
        if (!onExternalOpen) return;

        const target = event.target;
        if (!(target instanceof Element)) return;

        const anchor = target.closest<HTMLAnchorElement>("a[href]");
        if (!anchor) return;

        const href = anchor.getAttribute("href");
        if (!href || href.startsWith("/") || href.startsWith("#")) return;

        onExternalOpen(item, href);
      }}
    >
      <FeedContentHeader
        item={item}
        onPrevious={onPrevious}
        onNext={onNext}
        canPrevious={canPrevious}
        canNext={canNext}
        compact={isLaptopCompact}
      />

      <div className={contentGridClassName}>
        <div className="flex min-w-0 min-h-0 flex-col overflow-hidden rounded-2xl bg-base-200">
          <div className={`${mediaHeightClassName} overflow-hidden`}>
            <ContentEmbed url={item.url} prefetchedMetadata={item.contentMetadata} />
          </div>
          <FeedContentMetaCard
            item={item}
            submitterProfile={submitterProfile}
            normalizedAddress={normalizedAddress}
            following={following}
            followPending={followPending}
            watched={watched}
            watchPending={watchPending}
            onToggleFollow={onToggleFollow}
            onToggleWatch={onToggleWatch}
            compact={isLaptopCompact}
            embedded
            collapseDescription
          />
        </div>

        <div className="min-w-0 min-h-0 overflow-hidden rounded-2xl bg-base-200">
          <VotingQuestionCard
            contentId={item.id}
            categoryId={item.categoryId}
            currentRating={item.rating}
            openRound={item.openRound}
            onVote={isUp => onVote(item, isUp)}
            isCommitting={isCommitting}
            address={address}
            error={voteError}
            cooldownSecondsRemaining={cooldownSecondsRemaining}
            isOwnContent={item.isOwnContent}
            embedded
            compact={isLaptopCompact}
          />
        </div>
      </div>
    </div>
  );
});

interface FeedContentMetaCardProps {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  normalizedAddress?: string;
  following: boolean;
  followPending: boolean;
  watched: boolean;
  watchPending: boolean;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  compact?: boolean;
  embedded?: boolean;
  collapseDescription?: boolean;
}

interface FeedContentHeaderProps {
  item: ContentItem;
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious: boolean;
  canNext: boolean;
  compact?: boolean;
}

function FeedContentHeader({ item, onPrevious, onNext, canPrevious, canNext, compact }: FeedContentHeaderProps) {
  return (
    <div className={`rounded-2xl bg-base-200 ${compact ? "p-3" : "p-4 xl:p-3"}`}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Show previous card"
          className="btn btn-circle btn-sm border-0 bg-base-300 text-base-content/80 hover:bg-base-content/20 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2
            className={`break-words text-center font-display leading-[0.94] tracking-[0.02em] text-base-content ${
              compact
                ? "text-[1.55rem] sm:text-[1.7rem] xl:text-[1.62rem]"
                : "text-[1.7rem] sm:text-[1.9rem] xl:text-[1.75rem]"
            }`}
          >
            {item.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Show next card"
          className="btn btn-circle btn-sm border-0 bg-base-300 text-base-content/80 hover:bg-base-content/20 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function FeedContentMetaCard({
  item,
  submitterProfile,
  normalizedAddress,
  following,
  followPending,
  watched,
  watchPending,
  onToggleWatch,
  onToggleFollow,
  compact = false,
  embedded = false,
  collapseDescription = true,
}: FeedContentMetaCardProps) {
  const [showShare, setShowShare] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const platformType = detectPlatform(item.url).type;
  const detailsId = `content-details-${item.id.toString()}`;
  const hasFollowButton = !(normalizedAddress && item.submitter.toLowerCase() === normalizedAddress);
  const description = item.description.trim();
  const hasDescription = description.length > 0;
  const hasTags = item.tags.length > 0;
  const hasMagicDisclaimer = item.categoryId === 3n;
  const hasExpandableDetails = hasDescription || hasTags || hasMagicDisclaimer;
  const showExpandedDetails = !collapseDescription || isExpanded;
  const visibleTags = showExpandedDetails ? item.tags.filter(Boolean) : [];
  const wrapperClassName = embedded
    ? compact
      ? "border-t border-base-content/10 px-3 py-3"
      : "border-t border-base-content/10 p-4"
    : `rounded-2xl bg-base-200 ${compact ? "p-3" : "p-4 xl:p-3"}`;

  useEffect(() => {
    setIsExpanded(false);
  }, [item.id]);

  return (
    <>
      <div className={wrapperClassName}>
        <div className="flex items-center justify-between gap-3">
          <SubmitterBadge
            address={item.submitter}
            username={submitterProfile?.username}
            winRate={submitterProfile?.winRate}
            totalSettledVotes={submitterProfile?.totalSettledVotes}
            size="sm"
            addressMode={submitterProfile?.username ? "inline" : "hidden"}
          />
          <div className="flex shrink-0 items-center gap-1">
            {hasFollowButton ? (
              <FollowProfileButton
                following={following}
                pending={followPending}
                onClick={() => onToggleFollow(item.submitter)}
              />
            ) : null}
            <WatchContentButton watched={watched} pending={watchPending} onClick={() => onToggleWatch(item.id)} />
            <button
              type="button"
              onClick={() => setShowShare(true)}
              className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content"
              aria-label="Share content"
            >
              <ShareIcon className="h-4 w-4" />
            </button>
            {hasExpandableDetails ? (
              <MoreToggleButton
                expanded={showExpandedDetails}
                onClick={() => setIsExpanded(current => !current)}
                controlsId={detailsId}
              />
            ) : null}
          </div>
        </div>

        {showExpandedDetails ? (
          <div id={detailsId} className={compact ? "mt-2.5 space-y-2" : "mt-3 space-y-2.5"}>
            {hasDescription ? <p className="text-base leading-relaxed text-base-content/85">{description}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-base-300 px-2.5 py-1 text-sm font-medium leading-none text-base-content/80">
                {platformType}
              </span>
              {visibleTags.map(tag => (
                <span key={tag} className="text-sm text-base-content/70">
                  #{tag}
                </span>
              ))}
            </div>

            {hasMagicDisclaimer ? (
              <p className="text-base leading-tight text-base-content/70">
                Magic: The Gathering content is unofficial Fan Content permitted under the{" "}
                <a
                  href="https://company.wizards.com/en/legal/fancontentpolicy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-base-content/70"
                >
                  Fan Content Policy
                </a>
                . Not approved/endorsed by Wizards.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {showShare ? (
        <ShareContentModal
          contentId={item.id}
          title={item.title}
          description={item.description}
          onClose={() => setShowShare(false)}
        />
      ) : null}
    </>
  );
}

interface FeedQueueCardProps {
  item: ContentItem;
  onSelect: (id: bigint) => void;
  onNavigate?: (action: "previous" | "next" | "first" | "last", currentId: bigint) => void;
  queuePosition: number;
  queueStatus?: QueueCardStatus | null;
  hasVoted?: boolean;
  selected: boolean;
}

export const FeedQueueCard = memo(function FeedQueueCard({
  item,
  onSelect,
  onNavigate,
  queuePosition,
  queueStatus,
  hasVoted = false,
  selected,
}: FeedQueueCardProps) {
  const platform = detectPlatform(item.url);
  const [imageError, setImageError] = useState(false);
  const thumbnailSrc = getVoteFeedThumbnailSrc(item);
  const ratingScore = formatRatingScoreOutOfTen(item.rating);
  const statusBadgeClassName =
    queueStatus?.urgencyTone === "success"
      ? "bg-success/15 text-success ring-success/30"
      : queueStatus?.urgencyTone === "warning"
        ? "bg-warning/15 text-warning ring-warning/30"
        : queueStatus?.phaseTone === "blind"
          ? "bg-primary/15 text-primary ring-primary/30"
          : "bg-base-content/[0.05] text-base-content/75 ring-base-content/10";

  return (
    <button
      type="button"
      data-testid="content-thumbnail"
      data-thumbnail-id={item.id.toString()}
      data-disable-queue-wheel="true"
      aria-current={selected ? "true" : undefined}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(item.id)}
      onKeyDown={event => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onNavigate?.("previous", item.id);
          return;
        }

        if (event.key === "ArrowRight") {
          event.preventDefault();
          onNavigate?.("next", item.id);
          return;
        }

        if (event.key === "Home" || event.key === "PageUp") {
          event.preventDefault();
          onNavigate?.("first", item.id);
          return;
        }

        if (event.key === "End" || event.key === "PageDown") {
          event.preventDefault();
          onNavigate?.("last", item.id);
        }
      }}
      className={`group relative isolate flex w-[11.1rem] min-w-[11.1rem] flex-shrink-0 cursor-pointer snap-start flex-col overflow-hidden rounded-xl bg-base-200 text-left transition-colors sm:w-[11.35rem] sm:min-w-[11.35rem] xl:w-[11.8rem] xl:min-w-[11.8rem] ${
        selected ? "shadow-[0_18px_36px_rgba(9,10,12,0.26)]" : "hover:bg-base-200"
      }`}
    >
      <div className="relative aspect-video cursor-pointer overflow-hidden bg-base-200">
        <div className="absolute inset-x-2 top-2 z-10 flex items-center justify-between gap-1.5">
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-base-content backdrop-blur">
            {queuePosition + 1}
          </span>
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs text-base-content backdrop-blur">
            <span className="font-semibold tabular-nums">{ratingScore}</span>
            <span className="font-medium text-base-content/60">/10</span>
          </span>
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
          <div className="flex h-full w-full cursor-pointer items-end bg-[radial-gradient(circle_at_top,_rgba(242,100,38,0.18),_transparent_55%),linear-gradient(180deg,rgba(245,240,235,0.05),rgba(20,19,22,0.32))] p-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-primary/80">{platform.type}</p>
              <p className="mt-1 line-clamp-2 text-sm font-medium text-base-content/90">{item.title}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex min-h-[5.5rem] flex-1 flex-col p-2.5">
        <p className="line-clamp-2 text-sm font-medium leading-snug text-base-content/90">{item.title}</p>
        {queueStatus || hasVoted ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {queueStatus ? (
              <span
                className={`inline-flex items-center rounded-full px-2 py-1 text-[0.68rem] font-semibold tracking-[0.04em] ring-1 ${statusBadgeClassName}`}
              >
                {queueStatus.urgencyLabel}
              </span>
            ) : null}
            {hasVoted ? (
              <span className="inline-flex items-center rounded-full bg-base-content/[0.05] px-2 py-1 text-[0.68rem] font-semibold tracking-[0.04em] text-base-content/70 ring-1 ring-base-content/10">
                Voted
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {selected ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 rounded-xl ring-2 ring-inset ring-primary/75"
        />
      ) : null}
    </button>
  );
});
