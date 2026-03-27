"use client";

import { useEffect, useRef } from "react";

interface UseQueueNavigationOptions {
  enabled: boolean;
  onNavigate: (direction: "previous" | "next") => boolean;
  enableWheel?: boolean;
  cooldownMs?: number;
  threshold?: number;
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(
    target.closest("a,button,input,select,textarea,label,summary,[role='button'],[data-disable-queue-wheel='true']"),
  );
}

function getScrollableAncestor(target: EventTarget | null, container: HTMLElement) {
  if (!(target instanceof HTMLElement)) return null;

  let current: HTMLElement | null = target;
  while (current && current !== container) {
    const style = window.getComputedStyle(current);
    const canScrollY = /(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 1;

    if (canScrollY) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

export function useQueueNavigation<T extends HTMLElement>({
  enabled,
  onNavigate,
  enableWheel = false,
  cooldownMs = 320,
  threshold = 72,
}: UseQueueNavigationOptions) {
  const containerRef = useRef<T | null>(null);
  const wheelAccumulatorRef = useRef(0);
  const coolingDownRef = useRef(false);
  const touchGestureRef = useRef<{
    startX: number;
    startY: number;
    lastX: number;
    lastY: number;
    time: number;
    axis: "x" | "y" | null;
  } | null>(null);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !enabled) return;
    if (typeof window === "undefined") return;

    const handleWheel = (event: WheelEvent) => {
      if (!enableWheel) return;
      if (coolingDownRef.current) return;
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
      if (isInteractiveTarget(event.target)) return;

      const scrollableAncestor = getScrollableAncestor(event.target, node);
      if (scrollableAncestor) {
        const canScrollDown =
          scrollableAncestor.scrollTop + scrollableAncestor.clientHeight < scrollableAncestor.scrollHeight - 1;
        const canScrollUp = scrollableAncestor.scrollTop > 1;

        if ((event.deltaY > 0 && canScrollDown) || (event.deltaY < 0 && canScrollUp)) {
          return;
        }
      }

      wheelAccumulatorRef.current += event.deltaY;
      if (Math.abs(wheelAccumulatorRef.current) < threshold) return;

      const direction = wheelAccumulatorRef.current > 0 ? "next" : "previous";
      wheelAccumulatorRef.current = 0;
      if (!onNavigate(direction)) return;

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
      touchGestureRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        time: Date.now(),
        axis: null,
      };
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchGestureRef.current || event.touches.length !== 1) return;

      const touch = event.touches[0];
      touchGestureRef.current.lastX = touch.clientX;
      touchGestureRef.current.lastY = touch.clientY;

      const deltaX = touch.clientX - touchGestureRef.current.startX;
      const deltaY = touch.clientY - touchGestureRef.current.startY;

      if (!touchGestureRef.current.axis && (Math.abs(deltaX) > 12 || Math.abs(deltaY) > 12)) {
        touchGestureRef.current.axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }

      if (touchGestureRef.current.axis === "x" && event.cancelable) {
        event.preventDefault();
      }
    };

    const handleTouchEnd = (event: TouchEvent) => {
      if (coolingDownRef.current) return;
      if (!touchGestureRef.current || event.changedTouches.length !== 1) return;
      if (isInteractiveTarget(event.target)) return;

      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - touchGestureRef.current.startX;
      const deltaY = touch.clientY - touchGestureRef.current.startY;
      const duration = Date.now() - touchGestureRef.current.time;
      const axis = touchGestureRef.current.axis;
      touchGestureRef.current = null;

      if (duration > 900) return;
      if (axis !== "x") return;
      if (Math.abs(deltaX) < threshold) return;
      if (Math.abs(deltaX) <= Math.abs(deltaY)) return;

      const direction = deltaX > 0 ? "previous" : "next";
      if (!onNavigate(direction)) return;

      coolingDownRef.current = true;
      window.setTimeout(() => {
        coolingDownRef.current = false;
      }, cooldownMs);
    };

    const handleTouchCancel = () => {
      touchGestureRef.current = null;
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    node.addEventListener("touchstart", handleTouchStart, { passive: true });
    node.addEventListener("touchmove", handleTouchMove, { passive: false });
    node.addEventListener("touchend", handleTouchEnd, { passive: true });
    node.addEventListener("touchcancel", handleTouchCancel, { passive: true });

    return () => {
      node.removeEventListener("wheel", handleWheel);
      node.removeEventListener("touchstart", handleTouchStart);
      node.removeEventListener("touchmove", handleTouchMove);
      node.removeEventListener("touchend", handleTouchEnd);
      node.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [cooldownMs, enableWheel, enabled, onNavigate, threshold]);

  return containerRef;
}
