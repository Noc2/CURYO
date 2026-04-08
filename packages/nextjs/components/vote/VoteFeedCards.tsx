"use client";

import { memo, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowTopRightOnSquareIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import { ShareIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { MoreToggleButton } from "~~/components/shared/MoreToggleButton";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import { WatchContentButton } from "~~/components/shared/WatchContentButton";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";
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
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function isInteractiveTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(CONTENT_INTENT_INTERACTIVE_SELECTOR) !== null;
}

interface FeedVoteCardProps {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  titleId?: string;
  isActive?: boolean;
  onContentIntent?: (item: ContentItem) => void;
  onSourceOpen?: (item: ContentItem) => void;
  onToggleWatch: (id: bigint) => void;
  onToggleFollow: (address: string) => void;
  watched: boolean;
  watchPending: boolean;
  following: boolean;
  followPending: boolean;
  normalizedAddress?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious?: boolean;
  canNext?: boolean;
  deferEmbedClientFetch?: boolean;
}

export const FeedVoteCard = memo(function FeedVoteCard({
  item,
  submitterProfile,
  titleId,
  isActive = true,
  onContentIntent,
  onSourceOpen,
  onToggleWatch,
  onToggleFollow,
  watched,
  watchPending,
  following,
  followPending,
  normalizedAddress,
  onPrevious,
  onNext,
  canPrevious = false,
  canNext = false,
  deferEmbedClientFetch = false,
}: FeedVoteCardProps) {
  const [isLaptopCompact, setIsLaptopCompact] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
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
  const contentIntentEnabled = platformType !== "youtube";
  const mediaHeightClassName = usesIntrinsicMediaHeight
    ? "w-full"
    : isMobileViewport
      ? "w-full min-h-[14rem] max-h-[46svh] flex-1"
      : isLaptopCompact
        ? "w-full h-[clamp(18rem,50vh,24rem)]"
        : "w-full h-[clamp(20rem,56vh,32rem)]";

  return (
    <div className={`flex min-h-0 flex-col ${contentStackClassName}`}>
      <FeedContentHeader
        item={item}
        titleId={titleId}
        onPrevious={onPrevious}
        onNext={onNext}
        canPrevious={canPrevious}
        canNext={canNext}
        compact={useCompactCard}
      />

      <div className={contentGridClassName}>
        <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-base-200">
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
            onKeyDown={event => {
              if (!contentIntentEnabled || !onContentIntent) return;
              if (platformType === "spotify" || platformType === "twitter" || platformType === "twitch") return;
              if (event.key !== "Enter" && event.key !== " ") return;

              event.preventDefault();
              onContentIntent(item);
            }}
            role={
              contentIntentEnabled &&
              platformType !== "spotify" &&
              platformType !== "twitter" &&
              platformType !== "twitch"
                ? "button"
                : undefined
            }
            tabIndex={
              contentIntentEnabled &&
              platformType !== "spotify" &&
              platformType !== "twitter" &&
              platformType !== "twitch"
                ? 0
                : undefined
            }
            aria-label={contentIntentEnabled ? `Focus vote controls for ${item.title}` : undefined}
          >
            <ContentEmbed
              url={item.url}
              compact={useCompactEmbed}
              isActive={isActive}
              interactionMode={contentIntentEnabled ? "vote" : "default"}
              prefetchedMetadata={item.contentMetadata}
              deferClientFetch={deferEmbedClientFetch}
            />
            {contentIntentEnabled ? (
              <div aria-hidden="true" className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-start">
                <span className="inline-flex items-center rounded-full bg-black/55 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.16em] text-white/88 shadow-[0_10px_22px_rgba(0,0,0,0.28)] backdrop-blur-sm">
                  Rate below
                </span>
              </div>
            ) : null}
          </div>
          <FeedContentMetaCard
            item={item}
            submitterProfile={submitterProfile}
            onSourceOpen={onSourceOpen}
            normalizedAddress={normalizedAddress}
            following={following}
            followPending={followPending}
            watched={watched}
            watchPending={watchPending}
            onToggleFollow={onToggleFollow}
            onToggleWatch={onToggleWatch}
            compact={useCompactCard}
            embedded
            collapseDescription
          />
        </div>
      </div>
    </div>
  );
});

interface FeedContentMetaCardProps {
  item: ContentItem;
  submitterProfile?: SubmitterProfile;
  onSourceOpen?: (item: ContentItem) => void;
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
  titleId?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  canPrevious: boolean;
  canNext: boolean;
  compact?: boolean;
}

function FeedContentHeader({
  item,
  titleId,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  compact,
}: FeedContentHeaderProps) {
  return (
    <div className={`rounded-2xl bg-base-200 ${compact ? "px-4 py-3" : "px-5 py-4 xl:px-4 xl:py-3"}`}>
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Show previous card"
          className="btn btn-circle btn-sm shrink-0 border-0 bg-base-300 text-base-content/80 hover:bg-base-content/20 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h2
            id={titleId}
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
          className="btn btn-circle btn-sm shrink-0 border-0 bg-base-300 text-base-content/80 hover:bg-base-content/20 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
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
  onSourceOpen,
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
  const sourceLabel = getSourceLabel(item.url);
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

        <div
          className={compact ? "mt-2 flex flex-wrap items-center gap-2" : "mt-2.5 flex flex-wrap items-center gap-2"}
        >
          <span className="inline-flex items-center rounded-full bg-base-300 px-2.5 py-1 text-sm font-medium leading-none text-base-content/80">
            {platformType}
          </span>
          <SafeExternalLink
            href={item.url}
            allowExternalOpen
            testId="content-source-link"
            title={`Open source: ${sourceLabel}`}
            ariaLabel={`Open source: ${sourceLabel}`}
            onClick={() => onSourceOpen?.(item)}
            className="inline-flex items-center gap-1.5 rounded-full bg-base-content/[0.06] px-2.5 py-1 text-sm font-medium leading-none text-base-content/78 transition-colors hover:bg-base-content/[0.1] hover:text-base-content"
          >
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
            <span className="max-w-[12rem] truncate">{sourceLabel}</span>
          </SafeExternalLink>
          {visibleTags.map(tag => (
            <span key={tag} className="text-sm text-base-content/70">
              #{tag}
            </span>
          ))}
        </div>

        {showExpandedDetails ? (
          <div id={detailsId} className={compact ? "mt-2.5 space-y-2" : "mt-3 space-y-2.5"}>
            {hasDescription ? <p className="text-base leading-relaxed text-base-content/85">{description}</p> : null}

            <p className="text-sm leading-relaxed text-base-content/70">
              Source:{" "}
              <SafeExternalLink
                href={item.url}
                allowExternalOpen
                title={`Open source: ${sourceLabel}`}
                ariaLabel={`Open source: ${sourceLabel}`}
                onClick={() => onSourceOpen?.(item)}
                className="font-medium text-primary hover:underline"
              >
                {sourceLabel}
              </SafeExternalLink>
            </p>

            {hasMagicDisclaimer ? (
              <p className="text-base leading-tight text-base-content/70">
                Magic: The Gathering content is unofficial Fan Content permitted under the{" "}
                <a
                  href="https://company.wizards.com/en/legal/fancontentpolicy"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-allow-external-open="true"
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
