"use client";

import { blo } from "blo";

interface SubmitterBadgeProps {
  address: string;
  username?: string | null;
  profileImageUrl?: string | null;
  size?: "sm" | "md";
  showAddress?: boolean;
  winRate?: number;
  totalSettledVotes?: number;
  action?: React.ReactNode;
}

/**
 * Displays a submitter's avatar and name/address.
 * Falls back to blockie avatar if no custom image or if image fails to load.
 */
export function SubmitterBadge({
  address,
  username,
  profileImageUrl,
  size = "sm",
  showAddress = false,
  winRate,
  totalSettledVotes,
  action,
}: SubmitterBadgeProps) {
  const avatarSize = size === "sm" ? 20 : 28;
  const textSize = size === "sm" ? "text-base" : "text-base";

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = username || truncatedAddress;

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

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // Fallback to blockie on error
    e.currentTarget.src = blo(address as `0x${string}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <img
        src={profileImageUrl || blo(address as `0x${string}`)}
        onError={handleImageError}
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
            <span className={`${textSize} font-medium text-base-content/70 truncate`}>{displayName}</span>
            {showAccuracy && (
              <span
                className={`text-xs font-semibold px-1.5 py-0.5 rounded-full bg-base-200 ${accuracyColor}`}
                title={`${winPct}% win rate (${wins}W/${losses}L)`}
              >
                {winPct}%
              </span>
            )}
          </div>
          {showAddress && username && (
            <span className="text-base text-base-content/50 font-mono">{truncatedAddress}</span>
          )}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </div>
  );
}
