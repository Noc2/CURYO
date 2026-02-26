import type { PlatformHandler, PlatformInfo } from "../types";

/**
 * Extract game slug from RAWG URL formats.
 * Supported: https://rawg.io/games/elden-ring
 */
function extractRawgSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "rawg.io") return null;
    const match = parsed.pathname.match(/^\/games\/([a-z0-9-]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export const rawgHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractRawgSlug(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const slug = extractRawgSlug(url);
    return {
      type: "rawg",
      id: slug,
      url,
      thumbnailUrl: null,
      embedUrl: null,
      metadata: slug ? { slug } : undefined,
    };
  },

  getThumbnail(): string | null {
    return null;
  },

  getEmbedUrl(): string | null {
    return null;
  },

  getCanonicalUrl(url: string): string {
    const slug = extractRawgSlug(url);
    return slug ? `https://rawg.io/games/${slug}` : url;
  },
};
