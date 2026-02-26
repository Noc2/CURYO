"use client";

import { useState } from "react";
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

  const cardName = (info.metadata?.cardName as string)?.replace(/-/g, " ") || "MTG Card";
  const formattedName = cardName
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  if (!info.thumbnailUrl || imageError) {
    return (
      <a
        href={info.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
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
      </a>
    );
  }

  return (
    <a
      href={info.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`block w-full overflow-hidden rounded-xl bg-base-200 relative group ${
        compact ? "max-w-[200px] mx-auto" : "max-w-[350px] mx-auto"
      }`}
    >
      {!imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-base-200">
          <span className="loading loading-spinner loading-md text-primary"></span>
        </div>
      )}
      <img
        src={info.thumbnailUrl}
        alt={formattedName}
        className={`w-full h-auto rounded-xl shadow-lg transition-transform group-hover:scale-[1.02] ${
          imageLoaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setImageLoaded(true)}
        onError={() => setImageError(true)}
      />
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        <p className="text-white text-base font-bold text-center">{formattedName}</p>
        <p className="text-white/70 text-base text-center mt-0.5">View on Scryfall</p>
      </div>
    </a>
  );
}
