import type { EmbedOptions, PlatformHandler, PlatformInfo } from "../types";

type TwitchContentType = "video" | "clip" | "channel";

interface TwitchMetadata {
  contentType: TwitchContentType;
}

function extractTwitchInfo(url: string): { id: string; contentType: TwitchContentType } | null {
  try {
    const parsed = new URL(url);

    // clips.twitch.tv/CLIP_SLUG
    if (parsed.hostname === "clips.twitch.tv") {
      const clipSlug = parsed.pathname.slice(1); // Remove leading /
      if (clipSlug && !clipSlug.includes("/")) {
        return { id: clipSlug, contentType: "clip" };
      }
    }

    // twitch.tv URLs
    if (parsed.hostname.includes("twitch.tv")) {
      // twitch.tv/videos/123456789 - VODs
      const videoMatch = parsed.pathname.match(/\/videos\/(\d+)/);
      if (videoMatch) {
        return { id: videoMatch[1], contentType: "video" };
      }

      // twitch.tv/USER/clip/CLIP_SLUG - Clip on channel page
      const clipMatch = parsed.pathname.match(/\/[^/]+\/clip\/([^/]+)/);
      if (clipMatch) {
        return { id: clipMatch[1], contentType: "clip" };
      }

      // twitch.tv/USERNAME - Channel/stream page
      const channelMatch = parsed.pathname.match(/^\/([a-zA-Z0-9_]{1,25})$/);
      if (channelMatch) {
        return { id: channelMatch[1], contentType: "channel" };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export const twitchHandler: PlatformHandler = {
  matches(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes("twitch.tv") || parsed.hostname === "clips.twitch.tv";
    } catch {
      return false;
    }
  },

  extract(url: string): PlatformInfo {
    const info = extractTwitchInfo(url);
    if (!info) {
      return {
        type: "twitch",
        id: null,
        url,
        thumbnailUrl: null,
        embedUrl: null,
      };
    }

    // Build embed URL based on content type
    // Note: parent parameter is required by Twitch - will be set at runtime
    const parent = typeof window !== "undefined" ? window.location.hostname : "localhost";
    let embedUrl: string | null = null;
    if (info.contentType === "video") {
      embedUrl = `https://player.twitch.tv/?video=${info.id}&parent=${parent}`;
    } else if (info.contentType === "clip") {
      embedUrl = `https://clips.twitch.tv/embed?clip=${info.id}&parent=${parent}`;
    } else if (info.contentType === "channel") {
      embedUrl = `https://player.twitch.tv/?channel=${info.id}&parent=${parent}`;
    }

    return {
      type: "twitch",
      id: info.id,
      url,
      thumbnailUrl: null, // Twitch doesn't expose thumbnails without API
      embedUrl,
      metadata: { contentType: info.contentType } as Record<string, unknown>,
    };
  },

  getThumbnail(): string | null {
    // Twitch requires API access for thumbnails
    return null;
  },

  getEmbedUrl(info: PlatformInfo, options?: EmbedOptions): string | null {
    if (!info.id) return null;

    const parent = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const metadata = info.metadata as TwitchMetadata | undefined;
    const contentType = metadata?.contentType || "video";

    const params = new URLSearchParams();
    params.set("parent", parent);
    if (options?.autoplay) params.set("autoplay", "true");
    if (options?.muted) params.set("muted", "true");

    if (contentType === "video") {
      params.set("video", info.id);
      return `https://player.twitch.tv/?${params.toString()}`;
    } else if (contentType === "clip") {
      params.set("clip", info.id);
      return `https://clips.twitch.tv/embed?${params.toString()}`;
    } else {
      params.set("channel", info.id);
      return `https://player.twitch.tv/?${params.toString()}`;
    }
  },

  getCanonicalUrl(url: string): string {
    const info = extractTwitchInfo(url);
    if (!info) return url;
    if (info.contentType === "video") return `https://www.twitch.tv/videos/${info.id}`;
    if (info.contentType === "channel") return `https://www.twitch.tv/${info.id}`;
    return `https://clips.twitch.tv/${info.id}`;
  },
};
