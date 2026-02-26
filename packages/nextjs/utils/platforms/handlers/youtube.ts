import type { EmbedOptions, PlatformHandler, PlatformInfo } from "../types";

function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // youtube.com/watch?v=...
    if (parsed.hostname.includes("youtube.com") && parsed.searchParams.has("v")) {
      return parsed.searchParams.get("v");
    }

    // youtu.be/...
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }

    // youtube.com/embed/...
    if (parsed.hostname.includes("youtube.com") && parsed.pathname.startsWith("/embed/")) {
      return parsed.pathname.split("/embed/")[1];
    }

    return null;
  } catch {
    return null;
  }
}

export const youtubeHandler: PlatformHandler = {
  matches(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname.includes("youtube.com") || parsed.hostname === "youtu.be";
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
