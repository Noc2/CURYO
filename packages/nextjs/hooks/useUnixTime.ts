"use client";

import { useSyncExternalStore } from "react";

type Listener = () => void;

type ClockStore = {
  getSnapshot: () => number;
  subscribe: (listener: Listener) => () => void;
};

const stores = new Map<number, ClockStore>();

function createClockStore(intervalMs: number): ClockStore {
  let current = Math.floor(Date.now() / 1000);
  let timer: ReturnType<typeof setInterval> | null = null;
  const listeners = new Set<Listener>();

  const tick = () => {
    current = Math.floor(Date.now() / 1000);
    listeners.forEach(listener => listener());
  };

  const ensureTimer = () => {
    if (timer !== null) return;
    timer = setInterval(tick, intervalMs);
  };

  const clearTimer = () => {
    if (timer === null || listeners.size > 0) return;
    clearInterval(timer);
    timer = null;
  };

  return {
    getSnapshot: () => current,
    subscribe: listener => {
      listeners.add(listener);
      current = Math.floor(Date.now() / 1000);
      ensureTimer();

      return () => {
        listeners.delete(listener);
        clearTimer();
      };
    },
  };
}

function getClockStore(intervalMs: number): ClockStore {
  const existing = stores.get(intervalMs);
  if (existing) return existing;

  const store = createClockStore(intervalMs);
  stores.set(intervalMs, store);
  return store;
}

export function useUnixTime(intervalMs = 1000) {
  const store = getClockStore(intervalMs);
  return useSyncExternalStore(store.subscribe, store.getSnapshot, () => Math.floor(Date.now() / 1000));
}
