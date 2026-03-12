"use client";

import { memo, useState } from "react";
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

export function getVoteFeedThumbnailSrc(item: ContentItem) {
  const platform = detectPlatform(item.url);
  const thumbnailUrl = item.thumbnailUrl ?? platform.thumbnailUrl;
  return thumbnailUrl ? getThumbnailImageSrc(thumbnailUrl) : null;
}

interface FeedVoteCardProps {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  onSwipe: (item: ContentItem, direction: "left" | "right") => void;
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
}

export const FeedVoteCard = memo(function FeedVoteCard({
  item,
  submitterProfile,
  onSwipe,
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
}: FeedVoteCardProps) {
  return (
    <div className="surface-card h-full min-h-0 overflow-hidden rounded-2xl p-3 ring-1 ring-primary/20">
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
            onSwipe={direction => onSwipe(item, direction)}
            isTop
            index={0}
            canVote={!!address}
            standalone
            embedded
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
  );
});

interface FeedQueueCardProps {
  item: ContentItem;
  onSelect: (id: bigint, categoryId: bigint) => void;
  submitterProfile?: SubmitterProfile;
  queuePosition: number;
}

export const FeedQueueCard = memo(function FeedQueueCard({
  item,
  onSelect,
  submitterProfile,
  queuePosition,
}: FeedQueueCardProps) {
  const platform = detectPlatform(item.url);
  const [imageError, setImageError] = useState(false);
  const thumbnailSrc = getVoteFeedThumbnailSrc(item);
  const isNext = queuePosition === 1;

  return (
    <button
      type="button"
      data-testid="content-thumbnail"
      onClick={() => onSelect(item.id, item.categoryId)}
      className={`group w-full cursor-pointer overflow-hidden rounded-xl border text-left transition-colors xl:w-[12.75rem] xl:flex-shrink-0 ${
        isNext
          ? "border-primary/25 bg-primary/[0.05] hover:border-primary/40 hover:bg-primary/[0.08]"
          : "border-base-content/10 bg-base-content/[0.03] hover:border-primary/30 hover:bg-base-content/[0.05]"
      }`}
    >
      <div className="relative aspect-video cursor-pointer overflow-hidden bg-base-200 xl:aspect-[16/10]">
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1.5">
          <span className="rounded-full bg-black/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            {queuePosition + 1}
          </span>
          {isNext ? (
            <span className="rounded-full bg-primary/90 px-2.5 py-1 text-xs font-semibold text-primary-content">
              Next
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
          <span className="font-medium uppercase tracking-wide">{isNext ? "Up next" : "Queued"}</span>
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
