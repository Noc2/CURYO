import type { PlatformHandler, PlatformInfo } from "../types";
import { matchesHostname } from "~~/utils/urlHosts";

/**
 * Extract movie ID from various TMDB URL formats.
 * Supported formats:
 *  - https://www.themoviedb.org/movie/238
 *  - https://www.themoviedb.org/movie/238-the-godfather
 *  - https://themoviedb.org/movie/238
 */
function extractTmdbMovieId(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Check hostname (www.themoviedb.org or themoviedb.org)
    if (!matchesHostname(parsed.hostname, "themoviedb.org")) {
      return null;
    }

    // Match /movie/{id} or /movie/{id}-{slug}
    const pathMatch = parsed.pathname.match(/^\/movie\/(\d+)/);
    if (pathMatch) {
      return pathMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export const tmdbHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractTmdbMovieId(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const movieId = extractTmdbMovieId(url);

    return {
      type: "tmdb",
      id: movieId,
      url,
      thumbnailUrl: null, // Fetched async by the embed component via TMDB API
      embedUrl: null, // No iframe embed for TMDB
      metadata: movieId ? { movieId } : undefined,
    };
  },

  getThumbnail(): string | null {
    // Cannot construct thumbnail URL without the poster_path
    // which requires an API call. The embed component handles this.
    return null;
  },

  getEmbedUrl(): string | null {
    // TMDB doesn't support iframe embedding
    return null;
  },

  getCanonicalUrl(url: string): string {
    const movieId = extractTmdbMovieId(url);
    return movieId ? `https://www.themoviedb.org/movie/${movieId}` : url;
  },
};
