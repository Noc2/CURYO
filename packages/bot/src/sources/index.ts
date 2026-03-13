import type { ContentSource } from "./types.js";
import { youtubeSource } from "./youtube.js";
import { twitchSource } from "./twitch.js";
import { wikipediaSource } from "./wikipedia.js";
import { rawgSource } from "./rawg.js";
import { openLibrarySource } from "./openlibrary.js";
import { huggingFaceSource } from "./huggingface.js";
import { tmdbSource } from "./tmdb.js";
import { scryfallSource } from "./scryfall.js";
import { coinGeckoSource } from "./coingecko.js";

const allSources: ContentSource[] = [
  youtubeSource,
  twitchSource,
  wikipediaSource,
  rawgSource,
  openLibrarySource,
  huggingFaceSource,
  tmdbSource,
  scryfallSource,
  coinGeckoSource,
];

export function getAllSources(): ContentSource[] {
  return allSources;
}
