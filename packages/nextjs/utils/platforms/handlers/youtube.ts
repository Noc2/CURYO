import type { EmbedOptions, PlatformHandler, PlatformInfo } from "../types";
import { matchesHostname } from "~~/utils/urlHosts";

function isValidYouTubeId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.length > 0 && /^[\w-]+$/.test(id);
}

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);
    let id: string | null | undefined;

    // youtube.com/watch?v=...
    if (matchesHostname(parsed.hostname, "youtube.com") && parsed.searchParams.has("v")) {
      id = parsed.searchParams.get("v");
    }

    // youtu.be/...
    else if (parsed.hostname === "youtu.be") {
      id = parsed.pathname.slice(1).split("/")[0];
    }

    // youtube.com/embed/...
    else if (matchesHostname(parsed.hostname, "youtube.com") && parsed.pathname.startsWith("/embed/")) {
      id = parsed.pathname.split("/embed/")[1]?.split("/")[0];
    }

    return isValidYouTubeId(id) ? id : null;
  } catch {
    return null;
  }
}

export const youtubeHandler: PlatformHandler = {
  matches(url: string): boolean {
    try {
      const parsed = new URL(url);
      return matchesHostname(parsed.hostname, "youtube.com") || parsed.hostname === "youtu.be";
    } catch {
      return false;
    }
  },

  extract(url: string): PlatformInfo {
    const id = extractYouTubeId(url);
    return {
      type: "youtube",
      id,
      url,
      thumbnailUrl: id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null,
      embedUrl: id ? `https://www.youtube-nocookie.com/embed/${id}` : null,
    };
  },

  getThumbnail(info: PlatformInfo, quality = "mqdefault"): string | null {
    if (!info.id) return null;
    return `https://img.youtube.com/vi/${info.id}/${quality}.jpg`;
  },

  getEmbedUrl(info: PlatformInfo, options?: EmbedOptions): string | null {
    if (!info.id) return null;
    const base =
      options?.noCookie !== false ? "https://www.youtube-nocookie.com/embed" : "https://www.youtube.com/embed";
    const params = new URLSearchParams();
    if (options?.autoplay) params.set("autoplay", "1");
    if (options?.muted) params.set("mute", "1");
    const queryString = params.toString();
    return `${base}/${info.id}${queryString ? "?" + queryString : ""}`;
  },

  getCanonicalUrl(url: string): string {
    const id = extractYouTubeId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
  },
};
