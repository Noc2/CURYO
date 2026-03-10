import type { PlatformHandler, PlatformInfo } from "../types";
import { matchesHostname } from "~~/utils/urlHosts";

type SpotifyKind = "show" | "episode";

interface SpotifyItem {
  id: string;
  kind: SpotifyKind;
}

/**
 * Extract Spotify podcast show/episode IDs from canonical or embed URLs.
 * Supported formats:
 *  - https://open.spotify.com/show/{id}
 *  - https://open.spotify.com/episode/{id}
 *  - https://open.spotify.com/embed/show/{id}
 *  - https://open.spotify.com/embed/episode/{id}
 *  - https://open.spotify.com/intl-de/show/{id}
 */
function extractSpotifyItem(url: string): SpotifyItem | null {
  try {
    const parsed = new URL(url);

    if (!matchesHostname(parsed.hostname, "open.spotify.com")) {
      return null;
    }

    const segments = parsed.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;

    let index = 0;
    if (segments[index].startsWith("intl-")) {
      index += 1;
    }
    if (segments[index] === "embed") {
      index += 1;
    }

    const kind = segments[index];
    const id = segments[index + 1];
    if ((kind !== "show" && kind !== "episode") || !id || !/^[A-Za-z0-9]+$/.test(id)) {
      return null;
    }

    return { kind, id };
  } catch {
    return null;
  }
}

export const spotifyHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractSpotifyItem(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const item = extractSpotifyItem(url);
    const canonicalUrl = item ? `https://open.spotify.com/${item.kind}/${item.id}` : url;

    return {
      type: "spotify",
      id: item?.id ?? null,
      url,
      thumbnailUrl: null,
      embedUrl: item ? `https://open.spotify.com/embed/${item.kind}/${item.id}?utm_source=generator` : null,
      metadata: item
        ? {
            kind: item.kind,
            canonicalUrl,
            spotifyId: item.id,
          }
        : undefined,
    };
  },

  getThumbnail(): string | null {
    return null;
  },

  getEmbedUrl(info: PlatformInfo): string | null {
    return info.embedUrl;
  },

  getCanonicalUrl(url: string): string {
    const item = extractSpotifyItem(url);
    return item ? `https://open.spotify.com/${item.kind}/${item.id}` : url;
  },
};
