"use client";

import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

interface RatingBadgeProps {
  contentId: bigint;
}

/**
 * Displays the on-chain rating for a content item as a compact badge.
 * Rating is 0-100 (starts at 50).
 */
export function RatingBadge({ contentId }: RatingBadgeProps) {
  const { data: rating } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "getRating",
    args: [contentId],
  });

  const value = rating !== undefined ? Number(rating) : 50;

  // Color based on rating
  const color = value >= 60 ? "text-success" : value <= 40 ? "text-error" : "text-base-content/50";

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={`w-2 h-2 rounded-full ${
          value >= 60 ? "bg-success" : value <= 40 ? "bg-error" : "bg-base-content/30"
        }`}
      />
      <span className={`text-base font-semibold tabular-nums ${color}`}>{value}%</span>
      <span className="text-base text-base-content/30">rating</span>
    </div>
  );
}
