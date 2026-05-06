"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { stopProgress } from "next-nprogress-bar";
import {
  NAVIGATION_PROGRESS_TIMEOUT_MS,
  type NavigationProgressCandidate,
  buildNavigationProgressCandidate,
  shouldLogNavigationProgressDebug,
} from "~~/lib/ui/navigationProgressDiagnostics";

interface PendingNavigation extends NavigationProgressCandidate {
  id: number;
  startedAtMs: number;
  timeoutId: number;
}

function hasNProgressElement() {
  return Boolean(document.getElementById("nprogress"));
}

function getAnchorElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest("a") : null;
}

function hasPreventNProgressAttribute(anchor: HTMLAnchorElement, target: EventTarget | null) {
  if (anchor.getAttribute("data-prevent-nprogress") === "true") {
    return true;
  }

  let element = target instanceof Element ? target : null;
  while (element && element !== anchor) {
    if (element.getAttribute("data-prevent-nprogress") === "true") {
      return true;
    }
    element = element.parentElement;
  }

  return false;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

export function NavigationProgressDiagnostics() {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const searchParamsKey = searchParams?.toString() ?? "";
  const pendingNavigationRef = useRef<PendingNavigation | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    const pending = pendingNavigationRef.current;
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timeoutId);
    pendingNavigationRef.current = null;

    if (shouldLogNavigationProgressDebug(window.localStorage)) {
      console.info("[navigation-progress] completed", {
        elapsedMs: Math.round(performance.now() - pending.startedAtMs),
        from: pending.from,
        target: pending.target,
      });
    }
  }, [pathname, searchParamsKey]);

  useEffect(() => {
    function clearPendingNavigation(reason: string, forceStop = false) {
      const pending = pendingNavigationRef.current;
      if (!pending) {
        return;
      }

      window.clearTimeout(pending.timeoutId);
      pendingNavigationRef.current = null;

      if (forceStop && hasNProgressElement()) {
        stopProgress(true);
      }

      if (shouldLogNavigationProgressDebug(window.localStorage)) {
        console.info("[navigation-progress] cleared", {
          elapsedMs: Math.round(performance.now() - pending.startedAtMs),
          from: pending.from,
          reason,
          target: pending.target,
        });
      }
    }

    function beginNavigationWatch(candidate: NavigationProgressCandidate) {
      clearPendingNavigation("superseded");

      const id = sequenceRef.current + 1;
      sequenceRef.current = id;
      const startedAtMs = performance.now();
      const timeoutId = window.setTimeout(() => {
        const pending = pendingNavigationRef.current;
        if (!pending || pending.id !== id) {
          return;
        }

        const progressElementPresent = hasNProgressElement();
        const detail = {
          elapsedMs: Math.round(performance.now() - pending.startedAtMs),
          from: pending.from,
          path: window.location.pathname,
          progressElementPresent,
          target: pending.target,
          visibilityState: document.visibilityState,
        };

        pendingNavigationRef.current = null;

        if (progressElementPresent) {
          stopProgress(true);
        }

        console.warn("[navigation-progress] timed out; forced progress bar cleanup", detail);
        window.dispatchEvent(new CustomEvent("curyo:navigation-progress-timeout", { detail }));
      }, NAVIGATION_PROGRESS_TIMEOUT_MS);

      pendingNavigationRef.current = {
        ...candidate,
        id,
        startedAtMs,
        timeoutId,
      };

      if (shouldLogNavigationProgressDebug(window.localStorage)) {
        console.info("[navigation-progress] started", {
          from: candidate.from,
          target: candidate.target,
        });
      }
    }

    function handleDocumentClick(event: MouseEvent) {
      const anchor = getAnchorElement(event.target);
      if (!anchor) {
        return;
      }

      const candidate = buildNavigationProgressCandidate({
        currentHref: window.location.href,
        download: anchor.hasAttribute("download"),
        href: anchor.getAttribute("href"),
        isModifiedEvent: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
        nprogressDisabled:
          anchor.getAttribute("data-disable-nprogress") === "true" ||
          hasPreventNProgressAttribute(anchor, event.target),
        target: anchor.getAttribute("target"),
      });

      if (!candidate) {
        return;
      }

      window.setTimeout(() => {
        if (event.defaultPrevented) {
          if (hasNProgressElement()) {
            stopProgress(true);
          }
          if (shouldLogNavigationProgressDebug(window.localStorage)) {
            console.info("[navigation-progress] prevented click cleanup", {
              from: candidate.from,
              target: candidate.target,
            });
          }
          return;
        }

        beginNavigationWatch(candidate);
      }, 0);
    }

    function handleError(event: ErrorEvent) {
      const pending = pendingNavigationRef.current;
      if (!pending) {
        return;
      }

      console.error("[navigation-progress] error during pending navigation", {
        error: getErrorMessage(event.error ?? event.message),
        from: pending.from,
        target: pending.target,
      });
    }

    function handleUnhandledRejection(event: PromiseRejectionEvent) {
      const pending = pendingNavigationRef.current;
      if (!pending) {
        return;
      }

      console.error("[navigation-progress] unhandled rejection during pending navigation", {
        error: getErrorMessage(event.reason),
        from: pending.from,
        target: pending.target,
      });
    }

    document.addEventListener("click", handleDocumentClick, true);
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      const pending = pendingNavigationRef.current;
      if (pending) {
        window.clearTimeout(pending.timeoutId);
        pendingNavigationRef.current = null;
      }

      document.removeEventListener("click", handleDocumentClick, true);
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  return null;
}
