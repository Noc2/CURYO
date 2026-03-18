import { config, log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 6n;

// Map RAWG genre names to on-chain subcategory names
const GENRE_MAP: Record<string, string> = {
  "Action": "Action",
  "Shooter": "Action",
  "Platformer": "Action",
  "Fighting": "Action",
  "Arcade": "Action",
  "RPG": "RPG",
  "Massively Multiplayer": "RPG",
  "Strategy": "Strategy",
  "Simulation": "Simulation",
  "Adventure": "Adventure",
  "Indie": "Indie",
  "Sports": "Sports",
  "Racing": "Sports",
  "Puzzle": "Puzzle",
  "Casual": "Puzzle",
  "Board Games": "Puzzle",
  "Card": "Puzzle",
  "Educational": "Puzzle",
  "Family": "Puzzle",
};

export const rawgSource: ContentSource = {
  name: "rawg",
  categoryId: CATEGORY_ID,

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    if (!config.rawgApiKey) {
      log.debug("RAWG source skipped: RAWG_API_KEY not set");
      return [];
    }

    try {
      const res = await fetchWithTimeout(
        `https://api.rawg.io/api/games?key=${config.rawgApiKey}&ordering=-added&page_size=${limit}`,
      );
      if (!res.ok) {
        log.warn(`RAWG API error: ${res.status} ${res.statusText}`);
        return [];
      }

      const data = await res.json();
      const items: ContentItem[] = [];

      for (const game of (data.results ?? []).slice(0, limit)) {
        const title = truncateContentTitle(game.name);
        let tag = "Action";
        for (const genre of game.genres ?? []) {
          if (GENRE_MAP[genre.name]) {
            tag = GENRE_MAP[genre.name];
            break;
          }
        }

        items.push({
          url: `https://rawg.io/games/${game.slug}`,
          title,
          description: truncateContentDescription(title),
          tags: tag,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`RAWG source error: ${err.message}`);
      return [];
    }
  },
};
