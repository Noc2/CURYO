"use client";

import { useEffect, useRef } from "react";

interface UseQueueNavigationOptions {
  enabled: boolean;
  onAdvance: () => boolean;
  cooldownMs?: number;
  threshold?: number;
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest("a,button,input,select,textarea,label,summary,[role='button'],[data-disable-queue-wheel='true']"),
  );
}

export function useQueueNavigation<T extends HTMLElement>({
  enabled,
  onAdvance,
  cooldownMs = 320,
  threshold = 140,
}: UseQueueNavigationOptions) {
  const containerRef = useRef<T | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const coolingDownRef = useRef(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !enabled) return;
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia?.("(pointer: fine)");
    if (mediaQuery && !mediaQuery.matches) return;

    const handleWheel = (event: WheelEvent) => {
      if (coolingDownRef.current) return;
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (isInteractiveTarget(event.target)) return;

      if (event.deltaY <= 0) {
        wheelAccumulatorRef.current = 0;
        return;
      }

      wheelAccumulatorRef.current += event.deltaY;
      if (wheelAccumulatorRef.current < threshold) return;

      wheelAccumulatorRef.current = 0;
      if (!onAdvance()) return;

      event.preventDefault();
      coolingDownRef.current = true;
      window.setTimeout(() => {
        coolingDownRef.current = false;
      }, cooldownMs);
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (coolingDownRef.current || event.touches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;

      const touch = event.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (coolingDownRef.current) return;
      if (!touchStartRef.current || event.changedTouches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchStartRef.current.x;
      const deltaY = touchStartRef.current.y - touch.clientY;
      const duration = Date.now() - touchStartRef.current.time;
      touchStartRef.current = null;

      if (duration > 700) return;
      if (deltaY < 96) return;
      if (Math.abs(deltaY) <= Math.abs(deltaX)) return;
      if (!onAdvance()) return;

      coolingDownRef.current = true;
      window.setTimeout(() => {
        coolingDownRef.current = false;
      }, cooldownMs);
    };

    const handleTouchCancel = () => {
      touchStartRef.current = null;
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchend", handleTouchEnd, { passive: true });
    node.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      node.removeEventListener("wheel", handleWheel);
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [cooldownMs, enabled, onAdvance, threshold]);

  return containerRef;
}
