"use client";

import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import type { PlatformInfo } from "~~/utils/platforms";

interface SpotifyEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
}

function SpotifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 168 168" fill="currentColor" aria-hidden="true">
      <path d="M84 0a84 84 0 1 0 0 168 84 84 0 0 0 0-168Zm38.5 121.1a5.2 5.2 0 0 1-7.1 1.7c-19.4-11.9-43.8-14.6-72.4-8a5.2 5.2 0 0 1-2.3-10.1c31.3-7.2 58.2-4.1 80.1 9.3a5.2 5.2 0 0 1 1.7 7.1Zm10.2-22.7a6.5 6.5 0 0 1-8.9 2.1c-22.2-13.7-56-17.7-82.2-9.6a6.5 6.5 0 1 1-3.8-12.4c30-9.2 67.2-4.7 92.8 11.1a6.5 6.5 0 0 1 2.1 8.8Zm.9-23.6C107 59 62.8 57.8 37.7 65.4a7.8 7.8 0 0 1-4.6-14.9c28.8-8.7 76.7-7 108.8 12.1a7.8 7.8 0 0 1-8.3 13.2Z" />
    </svg>
  );
}

export function SpotifyEmbed({ info, compact }: SpotifyEmbedProps) {
  const kind = info.metadata?.kind === "show" ? "show" : "episode";
  const embedUrl =
    info.embedUrl ?? (info.id ? `https://open.spotify.com/embed/${kind}/${info.id}?utm_source=generator` : null);
  const height = kind === "show" ? (compact ? 232 : 352) : 152;

  if (!embedUrl) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-[#1db954] flex items-center justify-center shrink-0">
          <SpotifyIcon className="w-5 h-5 text-black" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Spotify item not found</p>
          <p className="text-base text-base-content/50 mt-0.5">Open in Spotify</p>
        </div>
      </SafeExternalLink>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl bg-base-200">
      <iframe
        src={embedUrl}
        width="100%"
        height={height}
        loading="lazy"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        title={`Spotify embed (${kind})`}
        className="block w-full border-0"
      />
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-base-300/50">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-full bg-[#1db954] flex items-center justify-center shrink-0">
            <SpotifyIcon className="w-3 h-3 text-black" />
          </div>
          <span className="text-xs text-base-content/60 truncate">
            {kind === "show" ? "Spotify podcast show" : "Spotify podcast episode"}
          </span>
        </div>
        <SafeExternalLink href={info.url} className="text-xs font-medium text-primary hover:underline shrink-0">
          Open
        </SafeExternalLink>
      </div>
    </div>
  );
}
