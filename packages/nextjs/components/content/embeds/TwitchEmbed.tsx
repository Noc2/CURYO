"use client";

import { useState } from "react";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import type { PlatformInfo } from "~~/utils/platforms";

interface TwitchEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
}

function TwitchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
    </svg>
  );
}

function TwitchFallbackCard({ url, compact }: { url: string; compact?: boolean }) {
  return (
    <SafeExternalLink
      href={url}
      className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
        compact ? "p-3" : "p-5"
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-[#9146FF] flex items-center justify-center shrink-0">
        <TwitchIcon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-medium truncate">Twitch Video</p>
        <p className="text-base text-base-content/50 mt-0.5">Click to view on Twitch</p>
      </div>
    </SafeExternalLink>
  );
}

/**
 * Twitch embed. In compact mode shows a fallback card. In full mode, shows
 * a click-to-load player to avoid Twitch autoplay/visibility issues.
 */
export function TwitchEmbed({ info, compact }: TwitchEmbedProps) {
  const [loaded, setLoaded] = useState(false);

  if (!info.embedUrl) {
    return <TwitchFallbackCard url={info.url} compact={compact} />;
  }

  // Compact mode — show a static card (iframes don't work well in small cards)
  if (compact) {
    return <TwitchFallbackCard url={info.url} compact />;
  }

  // Full mode — click-to-load pattern avoids autoplay/visibility errors
  if (!loaded) {
    return (
      <button
        onClick={() => setLoaded(true)}
        className="relative flex aspect-video w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[#0e0e10] embed-surface group"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-full bg-[#9146FF] flex items-center justify-center group-hover:scale-110 transition-transform">
            <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-white/70 text-sm">Click to load Twitch player</span>
        </div>
      </button>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl aspect-video">
      <iframe
        src={info.embedUrl}
        title="Twitch player"
        className="w-full h-full min-h-[200px]"
        allowFullScreen
        allow="autoplay; fullscreen; encrypted-media"
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
      />
    </div>
  );
}
