"use client";

import Link from "next/link";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { getReputationAvatarUrl } from "~~/utils/profileImage";

interface SubmitterBadgeProps {
  address: string;
  username?: string | null;
  size?: "sm" | "md";
  addressMode?: "hidden" | "stacked" | "inline";
  winRate?: number;
  totalSettledVotes?: number;
  action?: React.ReactNode;
}

/**
 * Displays a submitter's avatar and name/address.
 */
export function SubmitterBadge({
  address,
  username,
  size = "sm",
  addressMode = "hidden",
  winRate,
  totalSettledVotes,
  action,
}: SubmitterBadgeProps) {
  const { targetNetwork } = useTargetNetwork();
  const avatarSize = size === "sm" ? 20 : 28;
  const textSize = size === "sm" ? "text-base" : "text-base";

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = username || truncatedAddress;
  const inlineAddress = addressMode === "inline" && username ? truncatedAddress : null;
  const profileHref = `/profiles/${address.toLowerCase()}`;
  const avatarSrc = getReputationAvatarUrl(address, avatarSize, null, targetNetwork.id) || "";

  const showAccuracy = winRate !== undefined && totalSettledVotes !== undefined && totalSettledVotes >= 3;
  const winPct = showAccuracy ? Math.round(winRate! * 100) : 0;
  const wins = showAccuracy ? Math.round(winRate! * totalSettledVotes!) : 0;
  const losses = showAccuracy ? totalSettledVotes! - wins : 0;
  const accuracyColor = showAccuracy
    ? winRate! >= 0.6
      ? "text-success"
      : winRate! <= 0.4
        ? "text-error"
        : "text-base-content/50"
    : "";

  const stopPropagation = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={profileHref}
        aria-label={`View profile for ${displayName}`}
        className="group flex min-w-0 items-center gap-1.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        onClick={stopPropagation}
        onPointerDown={stopPropagation}
        onKeyDown={stopPropagation}
      >
        <img
          src={avatarSrc}
          width={avatarSize}
          height={avatarSize}
          alt={`${displayName} avatar`}
          className="rounded-full object-cover shrink-0"
          style={{ width: avatarSize, height: avatarSize }}
          loading="lazy"
        />
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span
                className={`${textSize} font-medium text-base-content/70 truncate transition-colors group-hover:text-primary`}
              >
                {displayName}
              </span>
              {inlineAddress ? (
                <span className="truncate text-sm font-mono text-base-content/45 transition-colors group-hover:text-base-content/60">
                  {inlineAddress}
                </span>
              ) : null}
              {showAccuracy && (
                <span
                  className={`text-xs font-semibold px-1.5 py-0.5 rounded-full bg-base-200 ${accuracyColor}`}
                  title={`${winPct}% win rate (${wins}W/${losses}L)`}
                >
                  {winPct}%
                </span>
              )}
            </div>
            {addressMode === "stacked" && username && (
              <span className="text-base text-base-content/50 font-mono transition-colors group-hover:text-base-content/70">
                {truncatedAddress}
              </span>
            )}
          </div>
        </div>
      </Link>
      <div className="flex min-w-0 items-center gap-1.5">
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
