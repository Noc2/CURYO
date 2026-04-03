import { youtubeStrategy } from "./youtube.js";
import { wikipediaStrategy } from "./wikipedia.js";
import { rawgStrategy } from "./rawg.js";
import { openLibraryStrategy } from "./openlibrary.js";
import { huggingFaceStrategy } from "./huggingface.js";
import { tmdbStrategy } from "./tmdb.js";
import { scryfallStrategy } from "./scryfall.js";
import { coinGeckoStrategy } from "./coingecko.js";
import { twitterStrategy } from "./twitter.js";
import type { RatingStrategy } from "./types.js";

const strategies: RatingStrategy[] = [
  youtubeStrategy,
  wikipediaStrategy,
  rawgStrategy,
  openLibraryStrategy,
  huggingFaceStrategy,
  tmdbStrategy,
  scryfallStrategy,
  coinGeckoStrategy,
  twitterStrategy,
  // Twitch skipped: no reliable quality signal available
];

export function getStrategy(url: string): RatingStrategy | null {
  return strategies.find(s => s.canRate(url)) ?? null;
}
