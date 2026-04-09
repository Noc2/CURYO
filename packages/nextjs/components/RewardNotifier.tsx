"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import {
  readLastClaimRewardNotificationAt,
  shouldNotifyAboutClaimableRewards,
  writeLastClaimRewardNotificationAt,
} from "~~/lib/notifications/claimRewards";
import { notification } from "~~/utils/scaffold-eth";

const CLAIMABLE_TOTAL_STORAGE_PREFIX = "curyo_last_notified_claimable_total";

function getClaimableTotalStorageKey(address: string) {
  return `${CLAIMABLE_TOTAL_STORAGE_PREFIX}:${address.toLowerCase()}`;
}

/**
 * Headless component that fires a toast when new claimable cREP appears.
 * Uses storage to avoid repeat toasts on page refresh and a cooldown to avoid spam.
 */
export function RewardNotifier() {
  const { address } = useAccount();
  const { totalClaimable } = useAllClaimableRewards();
  const prevRef = useRef<bigint | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    initialLoadRef.current = true;
    prevRef.current = null;
  }, [address]);

  useEffect(() => {
    if (!address || totalClaimable === undefined) return;
    if (typeof window === "undefined") return;

    const storageKey = getClaimableTotalStorageKey(address);

    // On first render, seed from sessionStorage
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      const stored = window.sessionStorage.getItem(storageKey);
      prevRef.current = stored ? BigInt(stored) : totalClaimable;
      window.sessionStorage.setItem(storageKey, totalClaimable.toString());
      return;
    }

    const prev = prevRef.current ?? 0n;
    const nowMs = Date.now();
    const lastNotifiedAtMs = readLastClaimRewardNotificationAt(address, window.localStorage);

    if (
      shouldNotifyAboutClaimableRewards({
        nowMs,
        previousTotal: prev,
        nextTotal: totalClaimable,
        lastNotifiedAtMs,
      })
    ) {
      const formatted = (Number(totalClaimable) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
      notification.success(
        <Link href="/governance" className="font-medium underline">
          {`You have ${formatted} cREP ready to claim.`}
        </Link>,
        { duration: 8000 },
      );
      writeLastClaimRewardNotificationAt(address, nowMs, window.localStorage);
    }

    prevRef.current = totalClaimable;
    window.sessionStorage.setItem(storageKey, totalClaimable.toString());
  }, [address, totalClaimable]);

  return null;
}
