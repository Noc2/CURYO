"use client";

import { blo } from "blo";

interface SubmitterBadgeProps {
  address: string;
  username?: string | null;
  profileImageUrl?: string | null;
  size?: "sm" | "md";
  showAddress?: boolean;
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
}: SubmitterBadgeProps) {
  const avatarSize = size === "sm" ? 20 : 28;
  const textSize = size === "sm" ? "text-base" : "text-base";

  const truncatedAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;
  const displayName = username || truncatedAddress;

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
      />
      <div className="flex flex-col min-w-0">
        <span className={`${textSize} font-medium text-base-content/70 truncate`}>{displayName}</span>
        {showAddress && username && (
          <span className="text-base text-base-content/50 font-mono">{truncatedAddress}</span>
        )}
      </div>
    </div>
  );
}
