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

// Cached snapshot — useSyncExternalStore requires referential stability
// (getSnapshot must return the same object if nothing changed).
let cachedRaw: string | null = null;
let cachedState: OnboardingState = DEFAULT_STATE;

function getState(): OnboardingState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedState;
  cachedRaw = raw;
  try {
    cachedState = raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : DEFAULT_STATE;
  } catch {
    cachedState = DEFAULT_STATE;
  }
  return cachedState;
}

function setState(update: Partial<OnboardingState>) {
  const current = getState();
  const next = { ...current, ...update };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  // Invalidate cache so getSnapshot returns fresh data
  cachedRaw = null;
  window.dispatchEvent(new Event("onboarding-change"));
}

function subscribe(cb: () => void) {
  const handler = () => cb();
  window.addEventListener("onboarding-change", handler);
  return () => {
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
