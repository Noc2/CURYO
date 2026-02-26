import { config } from "../config.js";
import type { RatingStrategy } from "./types.js";

function extractTmdbMovieId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("themoviedb.org")) return null;
    const match = parsed.pathname.match(/^\/movie\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export const tmdbStrategy: RatingStrategy = {
  name: "tmdb",

  canRate: (url) => extractTmdbMovieId(url) !== null,

  async getScore(url) {
    const movieId = extractTmdbMovieId(url);
    if (!movieId || !config.tmdbApiKey) return null;

    try {
      const res = await fetch(
        `https://api.themoviedb.org/3/movie/${movieId}?api_key=${config.tmdbApiKey}`,
      );
      if (!res.ok) return null;

      const data = await res.json();
      return data.vote_average ?? null; // Already 0-10 scale
    } catch {
      return null;
    }
  },
};
