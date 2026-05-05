"use client";

import LiteYouTubeEmbed from "react-lite-youtube-embed";
import "react-lite-youtube-embed/dist/LiteYouTubeEmbed.css";
import type { PlatformInfo } from "~~/utils/platforms";

interface YouTubeEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
  isActive?: boolean;
}

export function YouTubeEmbed({ info, isActive = true }: YouTubeEmbedProps) {
  if (!info.id) return null;

  return (
    <div className="w-full overflow-hidden rounded-lg">
      <LiteYouTubeEmbed
        key={`${info.id}-${isActive ? "active" : "inactive"}`}
        id={info.id}
        title="Content video"
        poster="hqdefault"
        noCookie={true}
      />
    </div>
  );
}
