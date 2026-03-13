import type { PlatformHandler, PlatformInfo } from "../types";
import { matchesHostname } from "~~/utils/urlHosts";

/**
 * Extract article title from various Wikipedia URL formats.
 * Supported formats:
 *  - https://en.wikipedia.org/wiki/Lionel_Messi
 *  - https://www.wikipedia.org/wiki/Marie_Curie
 *  - https://en.wikipedia.org/wiki/Elon_Musk#Early_life (strips fragment)
 */
function extractWikipediaTitle(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Check hostname (en.wikipedia.org, www.wikipedia.org, etc.)
    if (!matchesHostname(parsed.hostname, "wikipedia.org")) {
      return null;
    }

    // Match /wiki/{Title} path
    const pathMatch = parsed.pathname.match(/^\/wiki\/(.+)/);
    if (pathMatch) {
      // Decode URL-encoded titles (e.g., %C3%A9 → é) and return
      return decodeURIComponent(pathMatch[1]);
    }

    return null;
  } catch {
    return null;
  }
}

export const wikipediaHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractWikipediaTitle(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const title = extractWikipediaTitle(url);

    return {
      type: "wikipedia",
      id: title,
      url,
      thumbnailUrl: null, // Resolved later by shared metadata enrichment or the embed fallback fetch
      embedUrl: null, // No iframe embed for Wikipedia
      metadata: title ? { title } : undefined,
    };
  },

  getThumbnail(): string | null {
    // Cannot construct a deterministic thumbnail URL without an API call.
    // Shared metadata resolution or the embed fallback fetch handles enrichment.
    return null;
  },

  getEmbedUrl(): string | null {
    // Wikipedia doesn't support iframe embedding
    return null;
  },

  getCanonicalUrl(url: string): string {
    const title = extractWikipediaTitle(url);
    return title ? `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` : url;
  },
};
