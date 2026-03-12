"use client";

import { memo, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { ShareIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { GoalDisplay } from "~~/components/content/GoalDisplay";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { WatchContentButton } from "~~/components/shared/WatchContentButton";
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

const ShareContentModal = dynamic(
  () => import("~~/components/shared/ShareContentModal").then(m => m.ShareContentModal),
  { ssr: false },
);

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

interface ActiveMediaLayout {
  contentColumnClass: string;
  mediaShellClass: string;
}

function getActiveMediaLayout(url: string): ActiveMediaLayout {
  const platformType = detectPlatform(url).type;

  switch (platformType) {
    case "openlibrary":
    case "tmdb":
      return {
        contentColumnClass: "lg:w-[min(26rem,30vw)] xl:w-[min(30rem,28vw)] 2xl:w-[min(34rem,27vw)] lg:flex-none",
        mediaShellClass: "lg:aspect-[2/3]",
      };
    case "wikipedia":
      return {
        contentColumnClass: "lg:w-[min(27rem,31vw)] xl:w-[min(31rem,29vw)] 2xl:w-[min(35rem,28vw)] lg:flex-none",
        mediaShellClass: "lg:aspect-[3/4]",
      };
    case "scryfall":
      return {
        contentColumnClass: "lg:w-[min(25rem,29vw)] xl:w-[min(29rem,27vw)] 2xl:w-[min(33rem,26vw)] lg:flex-none",
        mediaShellClass: "lg:aspect-[5/7]",
      };
    case "github":
      return {
        contentColumnClass: "lg:w-[min(34rem,40vw)] xl:w-[min(40rem,40vw)] 2xl:w-[min(46rem,38vw)] lg:flex-none",
        mediaShellClass: "lg:aspect-[16/10]",
      };
    case "coingecko":
    case "huggingface":
      return {
        contentColumnClass: "lg:w-[min(30rem,34vw)] xl:w-[min(36rem,34vw)] 2xl:w-[min(40rem,32vw)] lg:flex-none",
        mediaShellClass: "lg:aspect-square",
      };
    case "rawg":
    case "youtube":
    case "twitch":
      return {
        contentColumnClass: "lg:flex-[1.55] xl:flex-[1.6] 2xl:flex-[1.65]",
        mediaShellClass: "lg:aspect-video",
      };
    case "spotify":
      return {
        contentColumnClass: "lg:flex-[1.6] xl:flex-[1.7] 2xl:flex-[1.8]",
        mediaShellClass: "",
      };
    case "twitter":
      return {
        contentColumnClass: "lg:w-[min(38rem,42vw)] xl:w-[min(44rem,42vw)] 2xl:w-[min(48rem,40vw)] lg:flex-none",
        mediaShellClass: "",
      };
    default:
      return {
        contentColumnClass: "lg:flex-[1.45] xl:flex-[1.5] 2xl:flex-[1.55]",
        mediaShellClass: "lg:aspect-video",
      };
  }
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
  const mediaLayout = getActiveMediaLayout(item.url);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 xl:gap-2.5">
      <FeedContentHeader
        item={item}
        onPrevious={onPrevious}
        onNext={onNext}
        canPrevious={canPrevious}
        canNext={canNext}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-center">
        <div className={`grid w-full min-h-0 gap-3 ${mediaLayout.contentColumnClass}`}>
          <div className={`min-h-0 overflow-hidden rounded-2xl bg-base-200 ${mediaLayout.mediaShellClass}`}>
            <div className="h-full w-full">
              <ContentEmbed url={item.url} />
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

        <div className="w-full min-h-0 rounded-2xl bg-base-200 lg:min-w-[19rem] lg:flex-1">
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
  const platformType = detectPlatform(item.url).type;

  return (
    <div className="rounded-2xl bg-black p-4 xl:p-3">
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
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
          <span className="truncate rounded-full bg-base-300 px-2.5 py-1 font-medium text-base-content/70">
            {platformType}
          </span>
          {item.tags[0] ? <span className="truncate text-base-content/45">#{item.tags[0]}</span> : null}
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

  return (
    <>
      <div className="rounded-2xl bg-black p-4 xl:p-3">
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

        <div className="mt-3">
          <GoalDisplay goal={item.goal} />
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
        <ShareContentModal contentId={item.id} goal={item.goal} onClose={() => setShowShare(false)} />
      ) : null}
    </>
  );
}

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
      data-disable-queue-wheel="true"
      aria-current={selected ? "true" : undefined}
      onClick={() => onSelect(item.id, item.categoryId)}
      className={`group w-[11rem] flex-shrink-0 cursor-pointer overflow-hidden rounded-xl border text-left transition-colors snap-start sm:w-[12rem] xl:w-[9.5rem] 2xl:w-[10rem] ${
        selected
          ? "border-primary bg-primary/[0.08] ring-2 ring-primary/35 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
          : "border-base-content/10 bg-base-content/[0.03] hover:border-primary/30 hover:bg-base-content/[0.05]"
      }`}
    >
      <div className="relative aspect-video cursor-pointer overflow-hidden bg-base-200 xl:aspect-[16/9]">
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

      <div className="space-y-1.5 p-2.5 xl:space-y-0.5 xl:p-1.5">
        <div className="flex items-center gap-2 text-xs text-base-content/55">
          <span className="font-medium uppercase tracking-wide">{selected ? "Selected" : "Card"}</span>
        </div>
        <p className="line-clamp-2 text-sm font-medium text-white/90 xl:text-[0.72rem] xl:leading-snug">{item.goal}</p>
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
