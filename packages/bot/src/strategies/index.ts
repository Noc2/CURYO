import { youtubeStrategy } from "./youtube.js";
import { wikipediaStrategy } from "./wikipedia.js";
import { rawgStrategy } from "./rawg.js";
import { openLibraryStrategy } from "./openlibrary.js";
import { huggingFaceStrategy } from "./huggingface.js";
import { tmdbStrategy } from "./tmdb.js";
import { scryfallStrategy } from "./scryfall.js";
import { coinGeckoStrategy } from "./coingecko.js";
import { twitterStrategy } from "./twitter.js";
import { githubStrategy } from "./github.js";
import type { RatingStrategy } from "./types.js";
import { getVoteStrategyCatalog } from "../sourceCatalog.js";

const strategyImplementations = {
  coingecko: coinGeckoStrategy,
  github: githubStrategy,
  huggingface: huggingFaceStrategy,
  openlibrary: openLibraryStrategy,
  rawg: rawgStrategy,
  scryfall: scryfallStrategy,
  tmdb: tmdbStrategy,
  twitter: twitterStrategy,
  wikipedia: wikipediaStrategy,
  youtube: youtubeStrategy,
} satisfies Record<string, RatingStrategy>;

const strategies: RatingStrategy[] = getVoteStrategyCatalog().map(entry => {
  const strategy = strategyImplementations[entry.strategyName as keyof typeof strategyImplementations];
  if (!strategy) {
    throw new Error(`Missing rating strategy implementation for ${entry.strategyName}`);
  }

  return strategy;
});

export function getStrategy(url: string): RatingStrategy | null {
  return strategies.find(s => s.canRate(url)) ?? null;
}
