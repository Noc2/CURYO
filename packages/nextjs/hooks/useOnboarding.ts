"use client";

import { useCallback, useMemo } from "react";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "curyo_onboarding";

interface OnboardingState {
  firstVoteCompleted: boolean;
  guideShown: boolean;
}

const DEFAULT_STATE: OnboardingState = {
  firstVoteCompleted: false,
  guideShown: false,
};

function getState(): OnboardingState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATE;
  }
}

function setState(update: Partial<OnboardingState>) {
  const current = getState();
  const next = { ...current, ...update };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Dispatch storage event so useSyncExternalStore re-renders
  window.dispatchEvent(new Event("onboarding-change"));
}

let listeners: (() => void)[] = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  const handler = () => cb();
  window.addEventListener("onboarding-change", handler);
  return () => {
    listeners = listeners.filter(l => l !== cb);
    window.removeEventListener("onboarding-change", handler);
  };
}

function getSnapshot() {
  return getState();
}

function getServerSnapshot() {
  return DEFAULT_STATE;
}

/**
 * Hook for tracking first-vote onboarding state.
 */
export function useOnboarding() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const isFirstVote = useMemo(() => !state.firstVoteCompleted, [state.firstVoteCompleted]);
  const shouldShowGuide = useMemo(() => !state.firstVoteCompleted && !state.guideShown, [state]);

  const markVoteCompleted = useCallback(() => {
    setState({ firstVoteCompleted: true });
  }, []);

  const dismissGuide = useCallback(() => {
    setState({ guideShown: true });
  }, []);

  return { isFirstVote, shouldShowGuide, markVoteCompleted, dismissGuide };
}
