"use client";

import { useEffect, useState } from "react";
import { type VoteQueueLayout, computeVoteQueueLayout } from "~~/lib/vote/queueLayout";

const DEFAULT_QUEUE_LAYOUT: VoteQueueLayout = {
  rows: 1,
  columns: 1,
  pageSize: 1,
  cardWidthPx: 204,
  gapPx: 10,
};

export function useVoteQueueLayout(containerElement: HTMLElement | null) {
  const [layout, setLayout] = useState<VoteQueueLayout>(DEFAULT_QUEUE_LAYOUT);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let animationFrame = 0;
    if (!containerElement) return;
    const scrollContainer = containerElement.closest("main");

    const updateLayout = () => {
      animationFrame = 0;
      const element = containerElement;
      const scrollContainerRect = scrollContainer?.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const availableHeight = Math.max(0, (scrollContainerRect?.bottom ?? window.innerHeight) - rect.top);

      const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const nextLayout = computeVoteQueueLayout({
        viewportWidth: window.innerWidth,
        containerWidth: element.clientWidth,
        availableHeight,
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
    observer.observe(containerElement);
    if (scrollContainer) {
      observer.observe(scrollContainer);
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [containerElement]);

  return layout;
}
