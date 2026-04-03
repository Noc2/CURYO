"use client";

import { useState } from "react";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import { getEmbedImageLoadingProps } from "~~/lib/content/embedLoadStrategy";
import type { PlatformInfo } from "~~/utils/platforms";

interface ScryfallEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
}

function MtgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" />
    </svg>
  );
}

/**
 * Scryfall MTG card embed.
 * Displays the card image directly from Scryfall API.
 */
export function ScryfallEmbed({ info, compact }: ScryfallEmbedProps) {
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageLoadingProps = getEmbedImageLoadingProps(compact);

  const cardName = (info.metadata?.cardName as string)?.replace(/-/g, " ") || "MTG Card";
  const formattedName = cardName
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  if (!info.thumbnailUrl || imageError) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center shrink-0">
          <MtgIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">{formattedName}</p>
          <p className="text-base text-base-content/50 mt-0.5">View on Scryfall</p>
        </div>
      </SafeExternalLink>
    );
  }

  return (
    <SafeExternalLink
      href={info.url}
      className={`block w-full overflow-hidden rounded-xl bg-base-200 embed-surface relative group ${
        compact ? "max-w-[200px] mx-auto" : "h-full max-w-full flex flex-col"
      }`}
    >
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center embed-surface">
          <span className="loading loading-spinner loading-md text-primary"></span>
        </div>
      )}
      <img
        src={`/api/image-proxy?url=${encodeURIComponent(info.thumbnailUrl)}`}
        alt={formattedName}
        {...imageLoadingProps}
        className={`shadow-lg transition-transform group-hover:scale-[1.02] ${
          compact
            ? "w-full h-auto rounded-xl aspect-[5/7] object-cover"
            : "h-full w-full rounded-xl object-contain object-center embed-surface"
        } ${imageLoaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-white text-base font-bold text-center">{formattedName}</p>
        <p className="text-white/70 text-base text-center mt-0.5">View on Scryfall</p>
      </div>
    </SafeExternalLink>
  );
}
