"use client";

import { useAccount } from "wagmi";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";

/**
 * Small pill badge showing claimable cREP rewards count.
 * Rendered next to the "cREP" nav link in the sidebar/mobile menu.
 */
export function CrepNavBadge() {
  const { address } = useAccount();
  const { totalClaimable } = useAllClaimableRewards();

  if (!address || totalClaimable <= 0n) return null;

  const formatted = (Number(totalClaimable) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <span className="ml-auto px-2 py-0.5 text-xs font-bold rounded-full bg-primary text-primary-content">
      {formatted}
    </span>
  );
}
