"use client";

import { useEffect, useState } from "react";
import { useExpectedPayout } from "~~/hooks/useExpectedPayout";

const STORAGE_KEY = "curyo-last-stake";

function getLastStake(): bigint {
  if (typeof window === "undefined") return 10_000_000n; // 10 cREP default
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return BigInt(stored);
  } catch {
    // ignore
  }
  return 10_000_000n;
}

export function saveLastStake(amount: bigint) {
  try {
    localStorage.setItem(STORAGE_KEY, amount.toString());
  } catch {
    // ignore
  }
}

interface ExpectedPayoutBadgeProps {
  contentId: bigint;
}

export function ExpectedPayoutBadge({ contentId }: ExpectedPayoutBadgeProps) {
  const [stake, setStake] = useState(10_000_000n);

  useEffect(() => {
    setStake(getLastStake());
    const handleStorage = () => setStake(getLastStake());
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const { potentialWinUp, potentialWinDown, potentialLoss } = useExpectedPayout(contentId, stake);

  // Don't show if no meaningful data
  if (potentialWinUp === 0n && potentialWinDown === 0n && potentialLoss === 0n) return null;

  const fmtWin = Math.max(Number(potentialWinUp), Number(potentialWinDown));
  const fmtLoss = Number(potentialLoss);
  const winDisplay = (fmtWin / 1e6).toFixed(0);
  const lossDisplay = (fmtLoss / 1e6).toFixed(0);

  return (
    <div className="flex items-center gap-1.5 text-xs tabular-nums">
      <span className="text-success">+{winDisplay}</span>
      <span className="text-base-content/30">/</span>
      <span className="text-error">-{lossDisplay}</span>
      <span className="text-base-content/30">cREP</span>
    </div>
  );
}
