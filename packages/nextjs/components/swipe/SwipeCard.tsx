"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { PanInfo, motion, useMotionValue, useTransform } from "framer-motion";
import { ShareIcon } from "@heroicons/react/24/outline";
import { ContentDescription } from "~~/components/content/ContentDescription";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { SubmitterBadge } from "~~/components/content/SubmitterBadge";
import { SwipeOverlay } from "~~/components/swipe/SwipeOverlay";
import type { ContentItem } from "~~/hooks/useContentFeed";
import type { SubmitterProfile } from "~~/hooks/useSubmitterProfiles";

const ShareContentModal = dynamic(
  () => import("~~/components/shared/ShareContentModal").then(m => m.ShareContentModal),
  { ssr: false },
);

const SWIPE_THRESHOLD = 120;

interface SwipeCardProps {
  content: ContentItem;
  submitterProfile?: SubmitterProfile;
  onSwipe?: (direction: "left" | "right") => void;
  isTop: boolean;
  index: number;
  canVote: boolean;
  actionBar?: React.ReactNode;
  leftActionBar?: React.ReactNode;
  rightActionBar?: React.ReactNode;
  /** When true, renders with relative positioning (no stack transforms). */
  standalone?: boolean;
  /** When true, removes card background/rounding (parent provides it). */
  embedded?: boolean;
  headerActions?: React.ReactNode;
  submitterAction?: React.ReactNode;
  enableSwipeVote?: boolean;
}

/**
 * Draggable swipe card — large, content-first design.
 * YouTube videos play inline. Swipe right = YES, left = NO.
 */
export function SwipeCard({
  content,
  submitterProfile,
  onSwipe,
  isTop,
  index,
  canVote,
  actionBar,
  leftActionBar,
  rightActionBar,
  standalone,
  embedded,
  headerActions,
  submitterAction,
  enableSwipeVote = true,
}: SwipeCardProps) {
  const [showShare, setShowShare] = useState(false);
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 0, 300], [-8, 0, 8]);
  const opacity = useTransform(x, [-300, -150, 0, 150, 300], [0.5, 1, 1, 1, 0.5]);

  const stackScale = isTop ? 1 : 1 - index * 0.03;
  const stackY = isTop ? 0 : index * 10;

  const canDrag = enableSwipeVote && isTop && canVote && !!onSwipe;

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!onSwipe) return;
    const offsetX = info.offset.x;
    const velocityX = info.velocity.x;
    if (offsetX > SWIPE_THRESHOLD || velocityX > 500) {
      onSwipe("right");
    } else if (offsetX < -SWIPE_THRESHOLD || velocityX < -500) {
      onSwipe("left");
    }
  };

  return (
    <motion.div
      className={standalone ? "w-full" : "absolute w-full"}
      style={standalone ? {} : { scale: stackScale, y: stackY, zIndex: 10 - index }}
      initial={false}
    >
      <motion.div
        className={`${embedded ? "" : "surface-card rounded-2xl"} overflow-hidden h-full flex flex-col ${canDrag ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={canDrag ? { x, rotate, opacity } : {}}
        drag={canDrag ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.9}
        onDragEnd={canDrag ? handleDragEnd : undefined}
        whileTap={canDrag ? { scale: 1.01 } : {}}
        exit={{ x: 500, opacity: 0, transition: { duration: 0.3 } }}
      >
        {/* Swipe overlays */}
        {canDrag && <SwipeOverlay x={x} />}

        <div className="px-4 pt-4 pb-2">
          <h2 className="line-clamp-2 text-xl font-semibold leading-tight text-white">{content.title}</h2>
        </div>

        {/* Video / Content embed — hero area */}
        <div className="w-full flex-1 min-h-0">
          <ContentEmbed url={content.url} />
        </div>

        {/* Card body */}
        <div className="px-4 py-3 space-y-2">
          {/* Submitter info + share */}
          <div className="flex items-center justify-between">
            {content.submitter && (
              <SubmitterBadge
                address={content.submitter}
                username={submitterProfile?.username}
                profileImageUrl={submitterProfile?.profileImageUrl}
                winRate={submitterProfile?.winRate}
                totalSettledVotes={submitterProfile?.totalSettledVotes}
                size="sm"
                action={submitterAction}
              />
            )}
            <div className="flex items-center gap-1">
              {headerActions}
              <button
                onClick={() => setShowShare(true)}
                className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content"
                aria-label="Share content"
              >
                <ShareIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
          <ContentDescription description={content.description} />

          {/* Vote action bar (only on top card) */}
          {isTop && (leftActionBar || actionBar || rightActionBar) && (
            <div className="flex items-center justify-between gap-4 pt-2 pb-1">
              <div className="flex-1 flex justify-start">{leftActionBar}</div>
              <div className="flex items-center justify-center gap-4">{actionBar}</div>
              <div className="flex-1 flex justify-end">{rightActionBar}</div>
            </div>
          )}

          {/* Wizards Fan Content Policy notice for MTG cards */}
          {content.categoryId === 3n && (
            <p className="text-base text-base-content/50 mt-2 leading-tight">
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
          )}
        </div>
      </motion.div>

      {showShare && (
        <ShareContentModal
          contentId={content.id}
          title={content.title}
          description={content.description}
          onClose={() => setShowShare(false)}
        />
      )}
    </motion.div>
  );
}
