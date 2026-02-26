"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { StakeSelector } from "~~/components/swipe/StakeSelector";
import { SwipeCard } from "~~/components/swipe/SwipeCard";
import { VoteActionBar } from "~~/components/swipe/VoteActionBar";
import { useOptimisticVote } from "~~/contexts/OptimisticVoteContext";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useRoundVote } from "~~/hooks/useRoundVote";
import { notification } from "~~/utils/scaffold-eth";

interface CardStackProps {
  items: ContentItem[];
  address?: string;
}

/**
 * Card stack manager with action bar.
 * Shows top 3 cards, handles swipe/vote actions.
 */
export function CardStack({ items, address }: CardStackProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stakeModal, setStakeModal] = useState<{
    isOpen: boolean;
    isUp: boolean;
    contentId: bigint;
    categoryId: bigint;
  }>({ isOpen: false, isUp: false, contentId: 0n, categoryId: 0n });
  const [, setExitDirection] = useState<"left" | "right" | null>(null);

  const { commitVote, isCommitting, error: voteError } = useRoundVote();
  const { addOptimisticVote } = useOptimisticVote();

  const visibleItems = items.slice(currentIndex, currentIndex + 3);

  const handleSwipe = useCallback(
    (direction: "left" | "right") => {
      if (currentIndex >= items.length) return;
      const content = items[currentIndex];
      const isUp = direction === "right";
      setExitDirection(direction);
      setStakeModal({ isOpen: true, isUp, contentId: content.id, categoryId: content.categoryId });
    },
    [currentIndex, items],
  );

  const handleConfirmStake = async (stakeAmount: number) => {
    // Immediately update UI with optimistic vote (convert to wei - 6 decimals)
    const stakeWei = BigInt(stakeAmount) * 1000000n;
    addOptimisticVote(stakeModal.contentId, stakeWei);

    const item = items.find(i => i.id === stakeModal.contentId);
    const success = await commitVote({
      contentId: stakeModal.contentId,
      isUp: stakeModal.isUp,
      stakeAmount,
      submitter: item?.submitter,
    });
    setStakeModal(prev => ({ ...prev, isOpen: false }));
    if (success) {
      notification.success(`Vote committed! Stake: ${stakeAmount} cREP`);
      setCurrentIndex(prev => prev + 1);
      setExitDirection(null);
    } else {
      // Show error notification if vote failed
      if (voteError) {
        notification.error(voteError);
      }
      setExitDirection(null);
    }
  };

  const handleCancelStake = () => {
    setStakeModal(prev => ({ ...prev, isOpen: false }));
    setExitDirection(null);
  };

  const handleButtonVote = (isUp: boolean) => {
    if (currentIndex >= items.length) return;
    handleSwipe(isUp ? "right" : "left");
  };

  const wheelCooldown = useRef(false);
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (wheelCooldown.current || isCommitting) return;
      const delta = e.deltaY;
      if (Math.abs(delta) < 30) return;
      wheelCooldown.current = true;
      if (delta > 0 && currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (delta < 0 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
      setTimeout(() => {
        wheelCooldown.current = false;
      }, 400);
    },
    [currentIndex, items.length, isCommitting],
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] sm:h-[500px] text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">No video yet</h2>
        <p className="text-base-content/50 text-base max-w-[280px]">
          Be the first to submit video, or check back later for new submissions.
        </p>
      </div>
    );
  }

  if (currentIndex >= items.length) {
    return (
      <div className="flex flex-col items-center justify-center h-[400px] sm:h-[500px] text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-success/10 flex items-center justify-center mb-5">
          <svg className="w-8 h-8 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold mb-2">All caught up!</h2>
        <p className="text-base-content/50 text-base max-w-[280px] mb-5">
          You&apos;ve reviewed all available content. Check back for more.
        </p>
        <button onClick={() => setCurrentIndex(0)} className="btn btn-primary btn-sm">
          Start over
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full">
      {/* Round progress + Card navigation */}
      <div className="flex items-center justify-between w-full mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentIndex(prev => prev - 1)}
            disabled={currentIndex === 0 || isCommitting}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-base-300/50 text-base-content/40 hover:bg-base-300 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Previous"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <span className="text-base font-medium text-base-content/40 tracking-wide tabular-nums">
            {currentIndex + 1} of {items.length}
          </span>
          <button
            onClick={() => setCurrentIndex(prev => prev + 1)}
            disabled={currentIndex >= items.length - 1 || isCommitting}
            className="w-7 h-7 rounded-full flex items-center justify-center bg-base-300/50 text-base-content/40 hover:bg-base-300 transition-all disabled:opacity-20 disabled:cursor-not-allowed"
            aria-label="Next"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>

        <RoundProgress contentId={visibleItems[0]?.id ?? 0n} />
      </div>

      {/* Card stack */}
      <div className="relative w-full h-[480px] sm:h-[600px]" onWheel={handleWheel}>
        <AnimatePresence>
          {visibleItems.map((item, i) => (
            <SwipeCard
              key={item.id.toString()}
              content={item}
              onSwipe={handleSwipe}
              isTop={i === 0}
              index={i}
              canVote={!!address}
              actionBar={
                address ? (
                  <VoteActionBar
                    contentId={item.id}
                    categoryId={item.categoryId}
                    onVote={handleButtonVote}
                    isCommitting={isCommitting}
                    isOwnContent={item.isOwnContent}
                  />
                ) : (
                  <RainbowKitCustomConnectButton />
                )
              }
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Loading indicator */}
      {isCommitting && (
        <motion.div className="mt-3 text-base text-base-content/50" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <span className="loading loading-spinner loading-sm mr-2"></span>
          Committing vote...
        </motion.div>
      )}

      {/* Stake selector modal */}
      <StakeSelector
        isOpen={stakeModal.isOpen}
        isUp={stakeModal.isUp}
        contentId={stakeModal.contentId}
        categoryId={stakeModal.categoryId}
        onConfirm={handleConfirmStake}
        onCancel={handleCancelStake}
      />
    </div>
  );
}
