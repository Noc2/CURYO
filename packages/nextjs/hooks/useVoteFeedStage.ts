"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentItem } from "~~/hooks/useContentFeed";

interface UseVoteFeedStageOptions {
  sessionKey?: string;
  visibleCount: number;
  requestedActiveId?: bigint | null;
}

export function resolveVoteFeedVisibleRange(
  itemCount: number,
  activeSourceIndex: number,
  visibleCount: number,
  windowSize: number,
) {
  const loadedCount = Math.min(Math.max(visibleCount, 0), itemCount);
  if (loadedCount === 0) {
    return { start: 0, end: 0 };
  }

  if (loadedCount <= windowSize) {
    return { start: 0, end: loadedCount };
  }

  const anchorIndex = Math.min(Math.max(activeSourceIndex, 0), loadedCount - 1);
  const halfWindow = Math.floor(windowSize / 2);
  const maxStart = Math.max(loadedCount - windowSize, 0);
  const start = Math.min(Math.max(anchorIndex - halfWindow, 0), maxStart);
  return {
    start,
    end: start + windowSize,
  };
}

export function resolveVoteFeedActiveSourceIndex(
  items: ReadonlyArray<{ id: bigint }>,
  activeContentId: bigint | null,
  requestedActiveId?: bigint | null,
) {
  if (items.length === 0) return -1;

  const preferredContentId = activeContentId ?? requestedActiveId ?? null;
  if (preferredContentId === null) return 0;

  const preferredIndex = items.findIndex(item => item.id === preferredContentId);
  if (preferredIndex !== -1) {
    return preferredIndex;
  }

  if (requestedActiveId !== undefined && requestedActiveId !== null && preferredContentId === requestedActiveId) {
    return -1;
  }

  return 0;
}

export function resolveVoteFeedActiveContentIdForSessionChange(
  activeContentId: bigint | null,
  previousSessionKey: string | undefined,
  nextSessionKey: string | undefined,
  requestedActiveId?: bigint | null,
) {
  if (previousSessionKey === nextSessionKey) {
    return activeContentId;
  }

  return requestedActiveId ?? null;
}

export function useVoteFeedStage(items: ContentItem[], options: UseVoteFeedStageOptions) {
  const { sessionKey, visibleCount, requestedActiveId } = options;
  const [activeContentId, setActiveContentId] = useState<bigint | null>(requestedActiveId ?? null);
  const previousSessionKeyRef = useRef(sessionKey);

  useEffect(() => {
    if (requestedActiveId === undefined) return;
    setActiveContentId(current => (current === requestedActiveId ? current : requestedActiveId));
  }, [requestedActiveId]);

  useEffect(() => {
    if (sessionKey === undefined) return;

    setActiveContentId(current => {
      const next = resolveVoteFeedActiveContentIdForSessionChange(
        current,
        previousSessionKeyRef.current,
        sessionKey,
        requestedActiveId,
      );
      return current === next ? current : next;
    });
    previousSessionKeyRef.current = sessionKey;
  }, [requestedActiveId, sessionKey]);

  useEffect(() => {
    if (items.length === 0) {
      if (requestedActiveId === undefined || requestedActiveId === null) {
        setActiveContentId(null);
      }
      return;
    }

    if (activeContentId !== null && items.some(item => item.id === activeContentId)) {
      return;
    }

    setActiveContentId(null);
  }, [activeContentId, items, requestedActiveId]);

  const activeSourceIndex = useMemo(() => {
    return resolveVoteFeedActiveSourceIndex(items, activeContentId, requestedActiveId);
  }, [activeContentId, items, requestedActiveId]);

  const activeItem = activeSourceIndex >= 0 ? (items[activeSourceIndex] ?? null) : null;

  const selectContent = useCallback((contentId: bigint | null) => {
    setActiveContentId(contentId);
  }, []);

  return {
    activeItem,
    activeSourceIndex,
    selectContent,
    loadedItems: items.slice(0, visibleCount),
  };
}
