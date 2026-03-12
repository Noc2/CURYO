"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContentItem } from "~~/hooks/useContentFeed";

interface UseVoteFeedStageOptions {
  visibleCount: number;
  requestedActiveId?: bigint | null;
  windowSize?: number;
}

export function useVoteFeedStage(items: ContentItem[], options: UseVoteFeedStageOptions) {
  const { visibleCount, requestedActiveId, windowSize = 7 } = options;
  const [activeContentId, setActiveContentId] = useState<bigint | null>(requestedActiveId ?? null);

  useEffect(() => {
    if (requestedActiveId === undefined) return;
    setActiveContentId(current => (current === requestedActiveId ? current : requestedActiveId));
  }, [requestedActiveId]);

  useEffect(() => {
    if (items.length === 0) {
      setActiveContentId(null);
      return;
    }

    if (activeContentId !== null && items.some(item => item.id === activeContentId)) {
      return;
    }

    setActiveContentId(null);
  }, [activeContentId, items]);

  const activeSourceIndex = useMemo(() => {
    if (items.length === 0) return -1;
    if (activeContentId === null) return 0;

    const index = items.findIndex(item => item.id === activeContentId);
    return index === -1 ? 0 : index;
  }, [activeContentId, items]);

  const visibleItems = useMemo(() => {
    const loadedItems = items.slice(0, visibleCount);
    if (loadedItems.length <= windowSize) return loadedItems;

    const halfWindow = Math.floor(windowSize / 2);
    const maxStart = Math.max(loadedItems.length - windowSize, 0);
    const start = Math.min(Math.max(activeSourceIndex - halfWindow, 0), maxStart);
    return loadedItems.slice(start, start + windowSize);
  }, [activeSourceIndex, items, visibleCount, windowSize]);
  const activeItem = activeSourceIndex >= 0 ? (items[activeSourceIndex] ?? null) : null;

  const selectContent = useCallback((contentId: bigint | null) => {
    setActiveContentId(contentId);
  }, []);

  const selectRelative = useCallback(
    (offset: number) => {
      if (items.length === 0) return null;

      const targetIndex = Math.min(Math.max(activeSourceIndex + offset, 0), items.length - 1);
      if (targetIndex === activeSourceIndex) return null;

      const nextItem = items[targetIndex];
      setActiveContentId(nextItem.id);
      return nextItem;
    },
    [activeSourceIndex, items],
  );

  return {
    activeContentId,
    activeItem,
    activeSourceIndex,
    selectContent,
    selectRelative,
    visibleItems,
  };
}
