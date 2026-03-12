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

  const orderedItems = useMemo(() => {
    if (items.length === 0) return [];
    if (activeSourceIndex <= 0) return items;
    return items.slice(activeSourceIndex);
  }, [activeSourceIndex, items]);

  const visibleItems = useMemo(() => orderedItems.slice(0, visibleCount), [orderedItems, visibleCount]);
  const activeItem = visibleItems[0] ?? null;
  const upNextItems = useMemo(() => visibleItems.slice(1), [visibleItems]);

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
