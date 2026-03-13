"use client";

import { RefObject, useEffect, useState } from "react";
import { type VoteQueueLayout, computeVoteQueueLayout } from "~~/lib/vote/queueLayout";

const DEFAULT_QUEUE_LAYOUT: VoteQueueLayout = {
  rows: 1,
  columns: 1,
  pageSize: 1,
  cardWidthPx: 204,
  gapPx: 10,
};

export function useVoteQueueLayout(containerRef: RefObject<HTMLElement | null>) {
  const [layout, setLayout] = useState<VoteQueueLayout>(DEFAULT_QUEUE_LAYOUT);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let animationFrame = 0;
    const observedElement = containerRef.current;
    if (!observedElement) return;

    const updateLayout = () => {
      animationFrame = 0;
      const element = containerRef.current;
      if (!element) return;

      const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const rect = element.getBoundingClientRect();
      const nextLayout = computeVoteQueueLayout({
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        containerWidth: element.clientWidth,
        availableHeight: Math.max(0, window.innerHeight - rect.top),
        rootFontSize,
      });

      setLayout(prev => {
        if (
          prev.rows === nextLayout.rows &&
          prev.columns === nextLayout.columns &&
          prev.pageSize === nextLayout.pageSize &&
          prev.cardWidthPx === nextLayout.cardWidthPx &&
          prev.gapPx === nextLayout.gapPx
        ) {
          return prev;
        }

        return nextLayout;
      });
    };

    const scheduleUpdate = () => {
      if (animationFrame !== 0) return;
      animationFrame = window.requestAnimationFrame(updateLayout);
    };

    scheduleUpdate();

    const observer = new ResizeObserver(() => {
      scheduleUpdate();
    });
    observer.observe(observedElement);
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [containerRef]);

  return layout;
}
