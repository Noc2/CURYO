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

    node.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      node.removeEventListener("wheel", handleWheel);
    };
  }, [cooldownMs, enabled, onAdvance, threshold]);

  return containerRef;
}
