"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "wagmi";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { notification } from "~~/utils/scaffold-eth";

const STORAGE_KEY = "curyo_last_notified_claimable";

/**
 * Headless component that fires a toast when new claimable rewards appear.
 * Uses sessionStorage to avoid repeat toasts on page refresh.
 */
export function RewardNotifier() {
  const { address } = useAccount();
  const { totalClaimable } = useAllClaimableRewards();
  const prevRef = useRef<bigint | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!address || totalClaimable === undefined) return;

    // On first render, seed from sessionStorage
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      const stored = sessionStorage.getItem(STORAGE_KEY);
      prevRef.current = stored ? BigInt(stored) : totalClaimable;
      sessionStorage.setItem(STORAGE_KEY, totalClaimable.toString());
      return;
    }

    const prev = prevRef.current ?? 0n;
    if (totalClaimable > prev) {
      const formatted = (Number(totalClaimable) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
      notification.success(`You have ${formatted} cREP rewards to claim!`, { duration: 6000 });
    }

    prevRef.current = totalClaimable;
    sessionStorage.setItem(STORAGE_KEY, totalClaimable.toString());
  }, [address, totalClaimable]);

  return null;
}
