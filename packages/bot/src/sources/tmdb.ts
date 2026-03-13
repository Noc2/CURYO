import { config, log } from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 9n; // Movies

// Map TMDB genre IDs to on-chain subcategory names
const GENRE_MAP: Record<number, string> = {
  28: "Action",
  12: "Action", // Adventure → Action
  16: "Animation",
  35: "Comedy",
  80: "Thriller", // Crime → Thriller
  99: "Documentary",
  18: "Drama",
  10751: "Comedy", // Family → Comedy
  14: "Sci-Fi", // Fantasy → Sci-Fi
  36: "Drama", // History → Drama
  27: "Horror",
  10402: "Drama", // Music → Drama
  9648: "Thriller", // Mystery → Thriller
  10749: "Drama", // Romance → Drama
  878: "Sci-Fi",
  53: "Thriller",
  10752: "Drama", // War → Drama
  37: "Action", // Western → Action
};

export const tmdbSource: ContentSource = {
  name: "tmdb",
  categoryId: CATEGORY_ID,

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    if (!config.tmdbApiKey) {
      log.debug("TMDB source skipped: TMDB_API_KEY not set");
      return [];
    }

    try {
      const res = await fetchWithTimeout(
        `https://api.themoviedb.org/3/movie/popular?api_key=${config.tmdbApiKey}&page=1`,
      );
      if (!res.ok) {
        log.warn(`TMDB API error: ${res.status} ${res.statusText}`);
        return [];
      }

      const data = await res.json();
      const items: ContentItem[] = [];

      for (const movie of (data.results ?? []).slice(0, limit)) {
        const tags = movie.genre_ids
          .map((id: number) => GENRE_MAP[id])
          .filter(Boolean)
          .filter((v: string, i: number, a: string[]) => a.indexOf(v) === i) // dedupe
          .slice(0, 3)
          .join(",") || "Drama";

        items.push({
          url: `https://www.themoviedb.org/movie/${movie.id}`,
          title: movie.title,
          description: (movie.overview || `Popular movie: ${movie.title}`).slice(0, 500),
          tags,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`TMDB source error: ${err.message}`);
      return [];
    }
  },
};
