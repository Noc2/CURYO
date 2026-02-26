import { config } from "../config.js";
import type { RatingStrategy } from "./types.js";

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

export const rawgStrategy: RatingStrategy = {
  name: "rawg",

  canRate: (url: string) => extractRawgSlug(url) !== null,

  async getScore(url: string): Promise<number | null> {
    const slug = extractRawgSlug(url);
    if (!slug || !config.rawgApiKey) return null;

    try {
      const res = await fetch(
        `https://api.rawg.io/api/games/${slug}?key=${config.rawgApiKey}`,
      );
      if (!res.ok) return null;

      const data = await res.json();

      // Prefer metacritic (0-100 scale, convert to 0-10)
      if (data.metacritic != null && data.metacritic > 0) {
        return data.metacritic / 10;
      }

      // Fallback to RAWG user rating (0-5 scale, convert to 0-10)
      if (data.rating != null && data.ratings_count > 0) {
        return data.rating * 2;
      }

      return null;
    } catch {
      return null;
    }
  },
};
