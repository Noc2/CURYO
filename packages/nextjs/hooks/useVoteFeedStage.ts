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

  const orderedItems = useMemo(() => {
    if (activeContentId === null) return items;

    const activeIndex = items.findIndex(item => item.id === activeContentId);
    if (activeIndex === -1) return items;

    const activeItem = items[activeIndex];
    return [activeItem, ...items.filter((_, index) => index !== activeIndex)];
  }, [activeContentId, items]);

  const visibleItems = useMemo(() => orderedItems.slice(0, visibleCount), [orderedItems, visibleCount]);
  const activeItem = visibleItems[0] ?? null;
  const upNextItems = useMemo(() => visibleItems.slice(1), [visibleItems]);
  const activeSourceIndex = useMemo(() => {
    if (activeItem === null) return -1;
    return items.findIndex(item => item.id === activeItem.id);
  }, [activeItem, items]);

  const selectContent = useCallback((contentId: bigint | null) => {
    setActiveContentId(contentId);
  }, []);

  const promoteToContent = useCallback((contentId: bigint) => {
    setActiveContentId(contentId);
  }, []);

  const promoteNext = useCallback(() => {
    const nextItem = upNextItems[0];
    if (!nextItem) return null;
    setActiveContentId(nextItem.id);
    return nextItem;
  }, [upNextItems]);

  return {
    activeContentId,
    activeItem,
    activeSourceIndex,
    orderedItems,
    promoteNext,
    promoteToContent,
    selectContent,
    upNextItems,
    visibleItems,
  };
}
