"use client";

import { useSyncExternalStore } from "react";

function subscribe(onStoreChange: () => void) {
  if (typeof document === "undefined") {
    return () => undefined;
  }

  document.addEventListener("visibilitychange", onStoreChange);
  window.addEventListener("focus", onStoreChange);
  window.addEventListener("blur", onStoreChange);

  return () => {
    document.removeEventListener("visibilitychange", onStoreChange);
    window.removeEventListener("focus", onStoreChange);
    window.removeEventListener("blur", onStoreChange);
  };
}

function getSnapshot() {
  if (typeof document === "undefined") {
    return true;
  }

  return !document.hidden;
}

export function usePageVisibility() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
