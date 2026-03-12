"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContentItem } from "~~/hooks/useContentFeed";

interface UseVoteFeedStageOptions {
  visibleCount: number;
  requestedActiveId?: bigint | null;
}

export function useVoteFeedStage(items: ContentItem[], options: UseVoteFeedStageOptions) {
  const { visibleCount, requestedActiveId } = options;
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

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
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
