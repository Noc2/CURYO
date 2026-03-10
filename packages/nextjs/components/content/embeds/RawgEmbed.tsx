"use client";

import { useEffect, useState } from "react";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import type { PlatformInfo } from "~~/utils/platforms";

interface RawgEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
}

interface RawgGame {
  name: string;
  description?: string;
  backgroundImage?: string;
  metacritic?: number;
}

/** Gamepad icon */
function GamepadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

async function fetchRawgGame(slug: string): Promise<RawgGame | null> {
  try {
    const response = await fetch(`/api/rawg?slug=${slug}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.name) return null;
    return {
      name: data.name,
      description: data.description_raw,
      backgroundImage: data.background_image,
      metacritic: data.metacritic,
    };
  } catch {
    return null;
  }
}

export function RawgEmbed({ info, compact }: RawgEmbedProps) {
  const [game, setGame] = useState<RawgGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const slug = info.id || (info.metadata?.slug as string);

  useEffect(() => {
    if (!slug) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    fetchRawgGame(slug)
      .then(data => {
        if (!cancelled) setGame(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // Loading state
  if (loading) {
    return (
      <div className={`flex items-center gap-3 bg-base-200 rounded-xl ${compact ? "p-3" : "p-5"}`}>
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center shrink-0">
          <span className="loading loading-spinner loading-sm text-white"></span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Loading game...</p>
          <p className="text-base text-base-content/50 mt-0.5">{slug}</p>
        </div>
      </div>
    );
  }

  // Error state or not found
  if (!game) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center shrink-0">
          <GamepadIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Game not found</p>
          <p className="text-base text-base-content/50 mt-0.5">View on RAWG</p>
        </div>
      </SafeExternalLink>
    );
  }

  // No image available — show link card
  if (!game.backgroundImage || imageError) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#1a1a2e] to-[#16213e] flex items-center justify-center shrink-0">
          <GamepadIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">{game.name}</p>
          <p className="text-base text-base-content/50 mt-0.5 line-clamp-1">
            {game.description?.slice(0, 100) || "View on RAWG"}
          </p>
        </div>
      </SafeExternalLink>
    );
  }

  // Image card with background image and attribution
  return (
    <div
      className={`block w-full overflow-hidden rounded-xl bg-base-200 relative ${
        compact ? "max-w-[200px] mx-auto" : "max-w-[350px] mx-auto"
      }`}
    >
      <SafeExternalLink href={info.url} className="block relative group">
        {!imageLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-base-200">
            <span className="loading loading-spinner loading-md text-primary"></span>
          </div>
        )}
        <img
          src={`/api/image-proxy?url=${encodeURIComponent(game.backgroundImage)}`}
          alt={game.name}
          loading="lazy"
          className={`w-full h-auto rounded-t-xl shadow-lg transition-transform group-hover:scale-[1.02] aspect-video object-cover ${
            imageLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-base font-bold text-center">{game.name}</p>
          {game.metacritic != null && (
            <p className="text-center mt-0.5">
              <span className="inline-block px-2 py-0.5 bg-green-600 text-white text-xs rounded font-bold">
                {game.metacritic}
              </span>
            </p>
          )}
          {game.description && (
            <p className="text-white/70 text-base text-center mt-0.5 line-clamp-2">{game.description.slice(0, 150)}</p>
          )}
        </div>
      </SafeExternalLink>
      {/* RAWG Attribution — required by RAWG ToS */}
      <div className="flex items-center justify-center gap-2 py-2 px-3 bg-base-300/50 rounded-b-xl">
        <GamepadIcon className="w-4 h-4 text-base-content/50" />
        <span className="text-xs text-base-content/50">Powered by RAWG</span>
      </div>
    </div>
  );
}
