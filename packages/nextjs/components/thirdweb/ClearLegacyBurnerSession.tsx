"use client";

import { useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";

const LEGACY_BURNER_MARKER = "burnerWallet";

function clearLegacyBurnerStorage(storage: Storage | null) {
  if (!storage) {
    return;
  }

  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) {
      continue;
    }

    const value = storage.getItem(key);
    if (key.includes(LEGACY_BURNER_MARKER) || value?.includes(LEGACY_BURNER_MARKER)) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    storage.removeItem(key);
  }
}

export function ClearLegacyBurnerSession() {
  const { connector } = useAccount();
  const { disconnect } = useDisconnect();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    clearLegacyBurnerStorage(window.localStorage);
    clearLegacyBurnerStorage(window.sessionStorage);
  }, []);

  useEffect(() => {
    if (connector?.id === LEGACY_BURNER_MARKER) {
      disconnect();
    }
  }, [connector?.id, disconnect]);

  return null;
}
