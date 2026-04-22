"use client";

import { type MouseEvent, memo, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowTopRightOnSquareIcon,
  ChatBubbleLeftRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "@heroicons/react/24/outline";
import { ShareIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { QuestionDescription, type QuestionReferenceContentSummary } from "~~/components/content/QuestionDescription";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import {
  FeedbackBonusAmountDisplay,
  RewardPoolAmountDisplay,
  VotingQuestionContextDetails,
} from "~~/components/shared/VotingQuestionCard";
import { WatchContentButton } from "~~/components/shared/WatchContentButton";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";
import { type ContentMediaItem, buildFallbackMediaItems, isDirectImageUrl } from "~~/lib/contentMedia";
import { detectPlatform } from "~~/utils/platforms";

const ShareContentModal = dynamic(
  () => import("~~/components/shared/ShareContentModal").then(m => m.ShareContentModal),
  { ssr: false },
);

const LAPTOP_VOTE_CARD_MEDIA_QUERY = "(min-width: 1024px) and (max-width: 1535px)";
const MOBILE_VOTE_CARD_MEDIA_QUERY = "(max-width: 767px)";
const CONTENT_INTENT_INTERACTIVE_SELECTOR =
  "a[href],button,input,select,textarea,summary,iframe,[role='button'],[role='link']";

function getSourceLabel(url: string) {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDeadlineDistance(deadline: bigint) {
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const seconds = Number(deadline - nowSeconds);
  if (seconds <= 0) return "now";
  if (seconds < 60 * 60) return `${Math.max(1, Math.ceil(seconds / 60))}m`;
  if (seconds < 24 * 60 * 60) return `${Math.ceil(seconds / (60 * 60))}h`;
  if (seconds < 7 * 24 * 60 * 60) return `${Math.ceil(seconds / (24 * 60 * 60))}d`;

  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(
    new Date(Number(deadline) * 1000),
  );
}

function getDeadlineChipClassName(tone: "active" | "ended") {
  return tone === "active"
    ? "border-primary/20 bg-primary/10 text-primary"
    : "border-base-content/10 bg-base-content/[0.05] text-base-content/62";
}

function getRewardDeadlineChips(item: ContentItem) {
  const chips: Array<{ label: string; tone: "active" | "ended" }> = [];
  const rewardSummary = item.rewardPoolSummary;
  const feedbackSummary = item.feedbackBonusSummary;

  const hasActiveBounty = Boolean(rewardSummary?.hasActiveBounty || (rewardSummary?.activeRewardPoolCount ?? 0) > 0);
  const hasActiveFeedback = Boolean(
    feedbackSummary?.hasActiveFeedbackBonus || (feedbackSummary?.activePoolCount ?? 0) > 0,
  );

  if (rewardSummary && hasActiveBounty) {
    chips.push({
      label: rewardSummary.nextBountyClosesAt
        ? `Bounty closes in ${formatDeadlineDistance(rewardSummary.nextBountyClosesAt)}`
        : "Bounty active",
      tone: "active",
    });
  } else if ((rewardSummary?.expiredRewardPoolCount ?? 0) > 0) {
    chips.push({
      label:
        rewardSummary?.totalAvailable && rewardSummary.totalAvailable > 0n
          ? "Bounty ended; claims remain"
          : "Bounty ended",
      tone: "ended",
    });
  }

  if (feedbackSummary && hasActiveFeedback) {
    chips.push({
      label: feedbackSummary.nextFeedbackClosesAt
        ? `Feedback closes in ${formatDeadlineDistance(feedbackSummary.nextFeedbackClosesAt)}`
        : "Feedback active",
      tone: "active",
    });
  } else if ((feedbackSummary?.expiredPoolCount ?? 0) > 0) {
    chips.push({ label: "Feedback ended", tone: "ended" });
  }

  return chips;
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(CONTENT_INTENT_INTERACTIVE_SELECTOR) !== null;
}

function getQuestionText(item: ContentItem) {
  return item.question?.trim() || item.title;
}

function getCardMediaItems(item: ContentItem): ContentMediaItem[] {
  if (item.media.length > 0) return item.media;
  if (item.thumbnailUrl) {
    return [
      {
        mediaIndex: 0,
        mediaType: "image",
        url: item.thumbnailUrl,
        canonicalUrl: item.thumbnailUrl,
        urlHost: null,
      },
    ];
  }
  return buildFallbackMediaItems(item.url);
}

function getPrimaryMediaItem(item: ContentItem): ContentMediaItem | null {
  return getCardMediaItems(item)[0] ?? null;
}

function getMediaPlatformType(media: ContentMediaItem | null) {
  if (!media?.url) return "text";
  if (media.mediaType === "video") return "youtube";
  if (isDirectImageUrl(media.url)) return "image";
  return detectPlatform(media.url).type;
}

interface FeedVoteCardProps {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  titleId?: string;
  isActive?: boolean;
  onContentIntent?: (item: ContentItem) => void;
  onOpenFeedback?: (item: ContentItem) => void;
  onSourceOpen?: (item: ContentItem) => void;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  watched: boolean;
  watchPending: boolean;
  following: boolean;
  followPending: boolean;
  normalizedAddress?: string;
  referencedContentById?: ReadonlyMap<string, QuestionReferenceContentSummary>;
}

export const FeedVoteCard = memo(function FeedVoteCard({
  item,
  submitterProfile,
  titleId,
  isActive = true,
  onContentIntent,
  onOpenFeedback,
  onSourceOpen,
  onToggleWatch,
  onToggleFollow,
  watched,
  watchPending,
  following,
  followPending,
  normalizedAddress,
  referencedContentById,
}: FeedVoteCardProps) {
  const [isLaptopCompact, setIsLaptopCompact] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const primaryMedia = getPrimaryMediaItem(item);
  const platformType = getMediaPlatformType(primaryMedia);

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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const mediaQuery = window.matchMedia(MOBILE_VOTE_CARD_MEDIA_QUERY);
    const updateMobileMode = () => {
      setIsMobileViewport(mediaQuery.matches);
    };

    updateMobileMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMobileMode);
      return () => {
        mediaQuery.removeEventListener("change", updateMobileMode);
      };
    }

    mediaQuery.addListener(updateMobileMode);
    return () => {
      mediaQuery.removeListener(updateMobileMode);
    };
  }, []);

  const useCompactCard = isLaptopCompact || isMobileViewport;
  const useCompactEmbed = isMobileViewport;
  const contentStackClassName = useCompactCard ? "gap-2" : "gap-3 xl:gap-2.5";
  const contentGridClassName = "grid min-h-0 flex-1 grid-cols-1 gap-3";
  const usesIntrinsicMediaHeight = platformType === "youtube";
  const mediaHeightClassName = usesIntrinsicMediaHeight
    ? "w-full"
    : isMobileViewport
      ? "w-full min-h-[14rem] max-h-[46svh] flex-1"
      : isLaptopCompact
        ? "w-full h-[clamp(18rem,50vh,24rem)]"
        : "w-full h-[clamp(20rem,56vh,32rem)]";
  const imageContextClickOpensExternally = platformType === "image";
  const contentIntentEnabled = Boolean(item.url) && platformType !== "youtube" && !imageContextClickOpensExternally;

  return (
    <div className={`flex min-h-0 flex-col ${contentStackClassName}`}>
      <FeedContentHeader item={item} titleId={titleId} compact={useCompactCard} />

      <div className={contentGridClassName}>
        <div
          data-testid="vote-content-card-shell"
          className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden rounded-lg bg-base-200"
        >
          <div
            className={`${mediaHeightClassName} relative overflow-hidden`}
            data-testid="vote-content-surface"
            onClickCapture={event => {
              if (!contentIntentEnabled || !onContentIntent) return;

              const target = event.target;
              if (!(target instanceof Element)) return;

              const contentIntentSurface = target.closest<HTMLElement>("[data-content-intent-surface='true']");
              if (contentIntentSurface) {
                event.stopPropagation();
                onContentIntent(item);
                return;
              }

              const anchor = target.closest<HTMLAnchorElement>("a[href]");
              if (!anchor) return;
              if (anchor.dataset.allowExternalOpen === "true") return;

              const href = anchor.getAttribute("href");
              if (!href || href.startsWith("/") || href.startsWith("#")) return;

              event.preventDefault();
              event.stopPropagation();
              onContentIntent(item);
            }}
            onClick={event => {
              if (!contentIntentEnabled || !onContentIntent) return;
              if (isInteractiveTarget(event.target)) return;
              onContentIntent(item);
            }}
          >
            <ContentMediaCarousel
              item={item}
              compact={useCompactEmbed}
              isActive={isActive}
              interactionMode={contentIntentEnabled ? "vote" : "default"}
              onSourceOpen={onSourceOpen}
            />
          </div>
          <FeedContentMetaCard
            item={item}
            submitterProfile={submitterProfile}
            onOpenFeedback={onOpenFeedback}
            onSourceOpen={onSourceOpen}
            normalizedAddress={normalizedAddress}
            following={following}
            followPending={followPending}
            watched={watched}
            watchPending={watchPending}
            onToggleFollow={onToggleFollow}
            onToggleWatch={onToggleWatch}
            referencedContentById={referencedContentById}
            compact={useCompactCard}
            isMobileViewport={isMobileViewport}
            isActive={isActive}
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
  onOpenFeedback?: (item: ContentItem) => void;
  onSourceOpen?: (item: ContentItem) => void;
  normalizedAddress?: string;
  following: boolean;
  followPending: boolean;
  watched: boolean;
  watchPending: boolean;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  referencedContentById?: ReadonlyMap<string, QuestionReferenceContentSummary>;
  compact?: boolean;
  isMobileViewport?: boolean;
  isActive?: boolean;
  embedded?: boolean;
}

interface FeedContentHeaderProps {
  item: ContentItem;
  titleId?: string;
  compact?: boolean;
}

function FeedContentHeader({ item, titleId, compact }: FeedContentHeaderProps) {
  const questionText = getQuestionText(item);
  const isLongQuestion = questionText.length > 90;
  const headlineSizeClassName = compact
    ? isLongQuestion
      ? "text-lg leading-snug sm:text-xl xl:text-lg"
      : "text-xl leading-tight sm:text-2xl xl:text-xl"
    : isLongQuestion
      ? "text-xl leading-snug sm:text-2xl xl:text-xl"
      : "text-2xl leading-tight sm:text-3xl xl:text-2xl";

  return (
    <div
      data-testid="vote-content-header"
      className={`rounded-lg bg-base-200 ${compact ? "px-4 py-3" : "px-5 py-4 xl:px-4 xl:py-3"}`}
    >
      <h2
        id={titleId}
        className={`text-balance break-words text-center font-sans font-semibold tracking-normal text-base-content ${headlineSizeClassName}`}
      >
        {questionText}
      </h2>
    </div>
  );
}

function ContentMediaCarousel({
  item,
  compact,
  isActive,
  interactionMode,
  onSourceOpen,
}: {
  item: ContentItem;
  compact: boolean;
  isActive: boolean;
  interactionMode: "default" | "vote";
  onSourceOpen?: (item: ContentItem) => void;
}) {
  const mediaItems = getCardMediaItems(item);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeMedia = mediaItems[activeIndex] ?? mediaItems[0] ?? null;
  const hasCarouselControls = mediaItems.length > 1;
  const contextUrl = item.url.trim();
  const imageLinkUrl = activeMedia && getMediaPlatformType(activeMedia) === "image" ? contextUrl : null;

  useEffect(() => {
    setActiveIndex(0);
  }, [item.id, mediaItems.length]);

  const showPrevious = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex(current => (current - 1 + mediaItems.length) % mediaItems.length);
  };

  const showNext = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setActiveIndex(current => (current + 1) % mediaItems.length);
  };

  return (
    <>
      <ContentEmbed
        url={activeMedia?.url ?? ""}
        thumbnailUrl={item.thumbnailUrl}
        title={item.title}
        description={item.description}
        compact={compact}
        showTextHeading={false}
        isActive={isActive}
        interactionMode={interactionMode}
        imageFit="contain"
        imageLinkUrl={imageLinkUrl}
        onImageLinkClick={() => onSourceOpen?.(item)}
      />
      {hasCarouselControls ? (
        <>
          <button
            type="button"
            onClick={showPrevious}
            aria-label="Show previous image"
            className="btn btn-circle btn-sm absolute left-3 top-1/2 z-10 -translate-y-1/2 border-0 bg-base-300/85 text-base-content/85 shadow hover:bg-base-content/20 hover:text-primary"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={showNext}
            aria-label="Show next image"
            className="btn btn-circle btn-sm absolute right-3 top-1/2 z-10 -translate-y-1/2 border-0 bg-base-300/85 text-base-content/85 shadow hover:bg-base-content/20 hover:text-primary"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <span
            className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-base-300/85 px-2.5 py-1 text-xs font-semibold leading-none text-base-content/80"
            aria-live="polite"
          >
            {activeIndex + 1} / {mediaItems.length}
          </span>
        </>
      ) : null}
    </>
  );
}

function FeedContentMetaCard({
  item,
  submitterProfile,
  onOpenFeedback,
  onSourceOpen,
  normalizedAddress,
  following,
  followPending,
  watched,
  watchPending,
  onToggleWatch,
  onToggleFollow,
  referencedContentById,
  compact = false,
  isMobileViewport = false,
  isActive = true,
  embedded = false,
}: FeedContentMetaCardProps) {
  const [showShare, setShowShare] = useState(false);
  const hasFollowButton = !(normalizedAddress && item.submitter.toLowerCase() === normalizedAddress);
  const description = item.description.trim();
  const hasDescription = description.length > 0;
  const contextUrl = item.url.trim();
  const contextLabel = getSourceLabel(contextUrl);
  const hasContextLink = contextUrl.length > 0 && contextLabel.trim().length > 0;
  const rewardPoolTotal = item.rewardPoolSummary?.totalAvailable ?? 0n;
  const feedbackBonusTotal = item.feedbackBonusSummary?.totalRemaining ?? 0n;
  const rewardDeadlineChips = getRewardDeadlineChips(item);
  const hideDockedActionButtons = isMobileViewport;
  const actionRowClassName = `flex items-center justify-between gap-3 ${compact ? "mt-3" : "mt-4"}`;
  const wrapperClassName = embedded
    ? compact
      ? "border-t border-base-content/10 px-3 py-3"
      : "border-t border-base-content/10 p-4"
    : `rounded-lg bg-base-200 ${compact ? "p-3" : "p-4 xl:p-3"}`;
  const actionButtons = (
    <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
      {hasFollowButton ? (
        <FollowProfileButton
          following={following}
          pending={followPending}
          onClick={() => onToggleFollow(item.submitter)}
        />
      ) : null}
      <WatchContentButton watched={watched} pending={watchPending} onClick={() => onToggleWatch(item.id)} />
      {onOpenFeedback && !hideDockedActionButtons ? (
        <button
          type="button"
          onClick={() => onOpenFeedback(item)}
          className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content xl:hidden"
          aria-label="Open feedback"
        >
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
        </button>
      ) : null}
      {!hideDockedActionButtons ? (
        <button
          type="button"
          onClick={() => setShowShare(true)}
          className="btn btn-ghost btn-sm btn-circle text-base-content/70 hover:text-base-content"
          aria-label="Share content"
        >
          <ShareIcon className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <div className={wrapperClassName}>
        <div className={compact ? "space-y-2.5" : "space-y-3"}>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <RewardPoolAmountDisplay amount={rewardPoolTotal} />
              <FeedbackBonusAmountDisplay amount={feedbackBonusTotal} />
            </div>
            {actionButtons}
          </div>
          {rewardDeadlineChips.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {rewardDeadlineChips.map(chip => (
                <span
                  key={chip.label}
                  className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getDeadlineChipClassName(
                    chip.tone,
                  )}`}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          ) : null}
          <VotingQuestionContextDetails
            contentId={item.id}
            categoryId={item.categoryId}
            openRound={item.openRound}
            roundConfig={item.roundConfig}
            compact={compact}
            active={isActive}
          />
        </div>

        {hasDescription ? (
          <div className={compact ? "mt-3 space-y-2" : "mt-4 space-y-2"}>
            <QuestionDescription
              description={description}
              referencedContentById={referencedContentById}
              className="text-base leading-relaxed text-base-content/85"
            />
          </div>
        ) : null}

        <div className={actionRowClassName}>
          <div className="min-w-0 flex-1">
            <SubmitterBadge
              address={item.submitter}
              username={submitterProfile?.username}
              winRate={submitterProfile?.winRate}
              totalSettledVotes={submitterProfile?.totalSettledVotes}
              size="sm"
              addressMode={submitterProfile?.username ? "inline" : "hidden"}
            />
          </div>
          {hasContextLink ? (
            <SafeExternalLink
              href={contextUrl}
              allowExternalOpen
              testId="content-source-link"
              title={`Open context: ${contextLabel}`}
              ariaLabel={`Open context: ${contextLabel}`}
              onClick={() => onSourceOpen?.(item)}
              className="inline-flex shrink-0 items-center gap-1.5 text-base font-semibold leading-snug text-primary underline-offset-4 transition-colors hover:text-primary-focus hover:underline"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4 shrink-0" />
              <span>Context</span>
            </SafeExternalLink>
          ) : null}
        </div>
      </div>

      {showShare ? (
        <ShareContentModal
          contentId={item.id}
          title={item.title}
          description={item.description}
          rating={item.rating}
          ratingBps={item.ratingBps !== undefined ? Number(item.ratingBps) : undefined}
          totalVotes={item.totalVotes}
          lastActivityAt={item.lastActivityAt}
          openRound={
            item.openRound
              ? {
                  referenceRatingBps:
                    item.openRound.referenceRatingBps !== undefined
                      ? Number(item.openRound.referenceRatingBps)
                      : undefined,
                  voteCount: item.openRound.voteCount,
                }
              : null
          }
          onClose={() => setShowShare(false)}
        />
      ) : null}
    </>
  );
}
