"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { ShareIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { WatchContentButton } from "~~/components/shared/WatchContentButton";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";
import { getQueueCardStatus } from "~~/lib/vote/queueCardStatus";
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
  return (
    <div className="flex h-full min-h-0 flex-col gap-3 xl:gap-2.5">
      <FeedContentHeader
        item={item}
        onPrevious={onPrevious}
        onNext={onNext}
        canPrevious={canPrevious}
        canNext={canNext}
      />

      <div className="grid min-h-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(21rem,25rem)] lg:items-stretch">
        <div className="min-w-0 min-h-0 overflow-hidden rounded-2xl bg-base-200">
          <div className="h-[clamp(17rem,42vh,28rem)] w-full">
            <ContentEmbed url={item.url} prefetchedMetadata={item.contentMetadata} />
          </div>
        </div>

        <div className="min-w-0 min-h-0 overflow-hidden rounded-2xl bg-base-200">
          <VotingQuestionCard
            contentId={item.id}
            categoryId={item.categoryId}
            title={item.title}
            onVote={isUp => onVote(item, isUp)}
            isCommitting={isCommitting}
            address={address}
            error={voteError}
            cooldownSecondsRemaining={cooldownSecondsRemaining}
            isOwnContent={item.isOwnContent}
            embedded
          />
        </div>
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
      />
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
}

interface FeedContentHeaderProps {
  item: ContentItem;
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious: boolean;
  canNext: boolean;
}

function FeedContentHeader({ item, onPrevious, onNext, canPrevious, canNext }: FeedContentHeaderProps) {
  return (
    <div className="rounded-2xl bg-base-200 p-4 xl:p-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Show previous card"
          className="btn btn-circle btn-sm border-0 bg-base-300 text-base-content/65 hover:bg-base-content/20 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-center text-xl font-semibold leading-tight text-base-content xl:text-lg">
            {item.title}
          </h2>
        </div>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Show next card"
          className="btn btn-circle btn-sm border-0 bg-base-300 text-base-content/65 hover:bg-base-content/20 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
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
}: FeedContentMetaCardProps) {
  const [showShare, setShowShare] = useState(false);
  const platformType = detectPlatform(item.url).type;

  return (
    <>
      <div className="rounded-2xl bg-base-200 p-4 xl:p-3">
        <div className="flex items-center justify-between gap-3">
          <SubmitterBadge
            address={item.submitter}
            username={submitterProfile?.username}
            profileImageUrl={submitterProfile?.profileImageUrl}
            winRate={submitterProfile?.winRate}
            totalSettledVotes={submitterProfile?.totalSettledVotes}
            size="sm"
            showAddress={Boolean(submitterProfile?.username)}
            action={
              normalizedAddress && item.submitter.toLowerCase() === normalizedAddress ? null : (
                <FollowProfileButton
                  following={following}
                  pending={followPending}
                  onClick={() => onToggleFollow(item.submitter)}
                />
              )
            }
          />
          <div className="flex items-center gap-1">
            <WatchContentButton watched={watched} pending={watchPending} onClick={() => onToggleWatch(item.id)} />
            <button
              type="button"
              onClick={() => setShowShare(true)}
              className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content"
              aria-label="Share content"
            >
              <ShareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 text-base leading-relaxed text-base-content/85">
          <span>{item.description}</span>
          <span className="ml-2 inline-flex items-center rounded-full bg-base-300 px-2.5 py-1 align-middle text-sm font-medium leading-none text-base-content/70">
            {platformType}
          </span>
          {item.tags[0] ? (
            <span className="ml-2 inline text-sm text-base-content/55 align-middle">#{item.tags[0]}</span>
          ) : null}
        </div>

        {item.categoryId === 3n ? (
          <p className="mt-3 text-base leading-tight text-base-content/50">
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
  onSelect: (id: bigint, categoryId: bigint) => void;
  onNavigate?: (action: "previous" | "next" | "first" | "last", currentId: bigint) => void;
  queuePosition: number;
  selected: boolean;
}

export const FeedQueueCard = memo(function FeedQueueCard({
  item,
  onSelect,
  onNavigate,
  queuePosition,
  selected,
}: FeedQueueCardProps) {
  const platform = detectPlatform(item.url);
  const [imageError, setImageError] = useState(false);
  const thumbnailSrc = getVoteFeedThumbnailSrc(item);
  const ratingLabel = `${item.rating}/100`;
  const roundSnapshot = useRoundSnapshot(item.id);
  const queueStatus = getQueueCardStatus(roundSnapshot);
  const statusBadgeClassName =
    queueStatus?.urgencyTone === "success"
      ? "bg-success/15 text-success ring-success/30"
      : queueStatus?.urgencyTone === "warning"
        ? "bg-warning/15 text-warning ring-warning/30"
        : queueStatus?.phaseTone === "blind"
          ? "bg-primary/15 text-primary ring-primary/30"
          : "bg-base-content/[0.05] text-base-content/65 ring-base-content/10";

  return (
    <button
      type="button"
      data-testid="content-thumbnail"
      data-thumbnail-id={item.id.toString()}
      data-disable-queue-wheel="true"
      aria-current={selected ? "true" : undefined}
      tabIndex={selected ? 0 : -1}
      onClick={() => onSelect(item.id, item.categoryId)}
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
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-base-content backdrop-blur">
            {ratingLabel}
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
        {queueStatus ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span
              className={`inline-flex items-center rounded-full px-2 py-1 text-[0.68rem] font-semibold tracking-[0.04em] ring-1 ${statusBadgeClassName}`}
            >
              {queueStatus.urgencyLabel}
            </span>
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
