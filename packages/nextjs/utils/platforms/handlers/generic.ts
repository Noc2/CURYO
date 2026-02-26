import type { PlatformHandler, PlatformInfo } from "../types";

export const genericHandler: PlatformHandler = {
  matches(): boolean {
    return true; // Always matches as fallback
  },

  extract(url: string): PlatformInfo {
    return {
      type: "generic",
      id: null,
      url,
      thumbnailUrl: null,
      embedUrl: null,
    };
  },

  getThumbnail(): string | null {
    return null;
  },

  getEmbedUrl(): string | null {
    return null;
  },

  getCanonicalUrl(url: string): string {
    try {
      const parsed = new URL(url);
      let hostname = parsed.hostname.toLowerCase();
      if (hostname.startsWith("www.")) hostname = hostname.slice(4);
      const path = parsed.pathname.replace(/\/+$/, "") || "/";
      return `https://${hostname}${path}${parsed.search}`;
    } catch {
      return url;
    }
  },
};
