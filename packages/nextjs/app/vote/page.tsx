"use client";

import { Suspense, useCallback } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, type PanInfo, type Variants, motion } from "framer-motion";
import type { NextPage } from "next";
import { CategoryFilter } from "~~/components/CategoryFilter";
import { VotingGuide } from "~~/components/onboarding/VotingGuide";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { StreakCounter } from "~~/components/shared/StreakCounter";
import { FeedScopeFilter } from "~~/components/vote/FeedScopeFilter";
import { FeedQueueCard, FeedVoteCard } from "~~/components/vote/VoteFeedCards";
import {
  BROKEN_FILTER,
  SEARCH_SORT_OPTIONS,
  type SearchSortOption,
  useVotePageController,
} from "~~/hooks/useVotePageController";
import { type VoteView } from "~~/lib/vote/viewOptions";

const StakeSelector = dynamic(() => import("~~/components/swipe/StakeSelector").then(m => m.StakeSelector), {
  loading: () => (
    <div className="flex items-center justify-center h-96">
      <span className="loading loading-spinner loading-lg"></span>
    </div>
  ),
});

const CARD_SWIPE_THRESHOLD = 96;
const VOTE_CARD_TRANSITION_EASE = [0.22, 1, 0.36, 1] as const;

const voteCardVariants: Variants = {
  enter: (direction: "previous" | "next") => ({
    opacity: 0.38,
    x: direction === "next" ? 22 : -22,
    y: 10,
    scale: 0.992,
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
  },
  exit: (direction: "previous" | "next") => ({
    opacity: 0.72,
    x: direction === "next" ? -14 : 14,
    y: 4,
    scale: 0.997,
  }),
};

const HomeInner = () => {
  const {
    activeCardRegionRef,
    activeCategory,
    activeSourceIndex,
    address,
    canLoadMore,
    canSwipeNavigate,
    categories,
    categoriesLoading,
    displayFeedLength,
    effectiveSearchSortBy,
    emptyStateMessage,
    enrichedProfiles,
    followedWallets,
    handleButtonVote,
    handleCancelStake,
    handleConfirmStake,
    handleNavigateSelection,
    handleQueueKeyboardNavigate,
    handleQueueRailRef,
    handleSelectCard,
    handleSelectNext,
    handleSelectPrevious,
    handleToggleFollow,
    handleToggleWatch,
    handleViewChange,
    isCommitting,
    isFollowPending,
    isLoading,
    isSearchMode,
    isWatchPending,
    loadMoreRef,
    navigationDirection,
    normalizedAddress,
    primaryItem,
    primaryItemCooldownSeconds,
    queueGridTemplateColumns,
    queueLayout,
    queuePageWidth,
    queuePages,
    queuePositionMap,
    scopeLoading,
    searchQuery,
    selectCategory,
    setSortBy,
    stakeModal,
    stakeModalCooldownSeconds,
    view,
    viewGroups,
    visibleFeedItems,
    voteError,
    watchedContentIds,
  } = useVotePageController();

  const handleCardDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      if (!canSwipeNavigate) return;

      const offsetX = info.offset.x;
      const velocityX = info.velocity.x;

      if (offsetX <= -CARD_SWIPE_THRESHOLD || velocityX <= -500) {
        handleNavigateSelection("next");
        return;
      }

      if (offsetX >= CARD_SWIPE_THRESHOLD || velocityX >= 500) {
        handleNavigateSelection("previous");
      }
    },
    [canSwipeNavigate, handleNavigateSelection],
  );

  return (
    <AppPageShell>
      <VotingGuide />
      <div
        className="mb-4 flex shrink-0 flex-wrap items-center gap-2 sm:gap-3 xl:mb-2 xl:flex-nowrap"
        data-disable-queue-wheel="true"
      >
        <CategoryFilter
          categories={categories}
          activeCategory={activeCategory}
          onSelect={selectCategory}
          pillClassName={(category, isActive) => {
            if (category !== BROKEN_FILTER) return undefined;
            return isActive
              ? "bg-warning/20 text-warning border border-warning/40"
              : "pill-inactive text-warning/70 hover:bg-warning/10";
          }}
        />
        <FeedScopeFilter
          value={view}
          groups={viewGroups}
          onChange={value => {
            void handleViewChange(value as VoteView);
          }}
          label="View"
        />
        <div className="shrink-0 flex items-center">
          <StreakCounter />
        </div>
      </div>

      {isSearchMode ? (
        <div className="mb-5 flex shrink-0 flex-wrap items-center gap-2 xl:mb-3" data-disable-queue-wheel="true">
          <div className="rounded-full bg-base-200 px-3 py-2 text-sm text-base-content/70">
            Results for <span className="font-medium text-base-content">&quot;{searchQuery.trim()}&quot;</span>
          </div>
          <select
            value={effectiveSearchSortBy}
            onChange={event => setSortBy(event.target.value as SearchSortOption)}
            className="select select-sm bg-base-200 text-base font-medium border-none focus:outline-none w-auto"
            aria-label="Sort search results"
          >
            {SEARCH_SORT_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="min-w-0">
        {isLoading || categoriesLoading || scopeLoading ? (
          <div className="flex justify-center py-16 xl:py-10">
            <span className="loading loading-spinner loading-lg text-primary"></span>
          </div>
        ) : displayFeedLength === 0 ? (
          <div className="py-16 text-center text-base text-base-content/30 xl:py-10">{emptyStateMessage}</div>
        ) : (
          <div ref={activeCardRegionRef} className="flex min-h-0 flex-col gap-5 xl:gap-4">
            {isCommitting ? (
              <div className="flex shrink-0 items-center justify-center">
                <span className="text-base text-base-content/50">
                  <span className="loading loading-spinner loading-xs mr-1.5"></span>
                  Committing...
                </span>
              </div>
            ) : null}

            {primaryItem ? (
              <div className="min-h-0">
                <AnimatePresence initial={false} mode="wait" custom={navigationDirection}>
                  <motion.div
                    key={primaryItem.id.toString()}
                    custom={navigationDirection}
                    className="touch-pan-y"
                    variants={voteCardVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={{
                      duration: 0.24,
                      ease: VOTE_CARD_TRANSITION_EASE,
                    }}
                    drag={canSwipeNavigate ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.12}
                    dragMomentum={false}
                    onDragEnd={handleCardDragEnd}
                  >
                    <FeedVoteCard
                      item={primaryItem}
                      submitterProfile={enrichedProfiles[primaryItem.submitter.toLowerCase()]}
                      onVote={handleButtonVote}
                      onToggleWatch={handleToggleWatch}
                      onToggleFollow={handleToggleFollow}
                      watched={watchedContentIds.has(primaryItem.id.toString())}
                      watchPending={isWatchPending(primaryItem.id)}
                      following={followedWallets.has(primaryItem.submitter.toLowerCase())}
                      followPending={isFollowPending(primaryItem.submitter)}
                      normalizedAddress={normalizedAddress}
                      isCommitting={isCommitting}
                      voteError={voteError}
                      cooldownSecondsRemaining={primaryItemCooldownSeconds}
                      address={address}
                      onPrevious={handleSelectPrevious}
                      onNext={handleSelectNext}
                      canPrevious={activeSourceIndex > 0}
                      canNext={activeSourceIndex >= 0 && activeSourceIndex < displayFeedLength - 1}
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            ) : null}

            {visibleFeedItems.length > 0 ? (
              <motion.section
                key={primaryItem?.id.toString() ?? "queue-empty"}
                className="shrink-0"
                aria-label="Up next queue"
                initial={{ opacity: 0.82, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: VOTE_CARD_TRANSITION_EASE }}
              >
                <div
                  ref={handleQueueRailRef}
                  data-disable-queue-wheel="true"
                  className={`scrollbar-hide min-w-0 overflow-x-auto snap-x snap-mandatory ${
                    queueLayout.rows === 2 ? "flex items-start gap-4 xl:gap-3" : "flex items-stretch gap-3 xl:gap-2.5"
                  }`}
                  aria-label="Content queue"
                >
                  {queueLayout.rows === 2
                    ? queuePages.map((pageItems, pageIndex) => (
                        <div
                          key={`queue-page-${pageIndex}`}
                          className="grid shrink-0 content-start gap-3 snap-start xl:gap-2.5"
                          style={{
                            gridTemplateColumns: queueGridTemplateColumns,
                            width: queuePageWidth,
                          }}
                        >
                          {pageItems.map(item => (
                            <FeedQueueCard
                              key={item.id.toString()}
                              item={item}
                              onSelect={handleSelectCard}
                              onNavigate={handleQueueKeyboardNavigate}
                              queuePosition={queuePositionMap.get(item.id.toString()) ?? 0}
                              selected={item.id === primaryItem?.id}
                            />
                          ))}
                        </div>
                      ))
                    : visibleFeedItems.map(item => (
                        <FeedQueueCard
                          key={item.id.toString()}
                          item={item}
                          onSelect={handleSelectCard}
                          onNavigate={handleQueueKeyboardNavigate}
                          queuePosition={queuePositionMap.get(item.id.toString()) ?? 0}
                          selected={item.id === primaryItem?.id}
                        />
                      ))}
                </div>
              </motion.section>
            ) : null}

            {canLoadMore ? (
              <div ref={loadMoreRef} className="flex justify-center py-8 xl:hidden">
                <span className="loading loading-spinner loading-md text-primary"></span>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <StakeSelector
        isOpen={stakeModal.isOpen}
        isUp={stakeModal.isUp}
        contentId={stakeModal.contentId}
        categoryId={stakeModal.categoryId}
        cooldownSecondsRemaining={stakeModalCooldownSeconds}
        onConfirm={handleConfirmStake}
        onCancel={handleCancelStake}
      />
    </AppPageShell>
  );
};

const Home: NextPage = () => (
  <Suspense>
    <HomeInner />
  </Suspense>
);

export default Home;
