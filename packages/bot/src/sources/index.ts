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
import { githubSource } from "./github.js";
import { getSubmitSourceCatalog } from "../sourceCatalog.js";

const sourceImplementations = {
  coingecko: coinGeckoSource,
  github: githubSource,
  huggingface: huggingFaceSource,
  openlibrary: openLibrarySource,
  rawg: rawgSource,
  scryfall: scryfallSource,
  tmdb: tmdbSource,
  twitch: twitchSource,
  "wikipedia-people": wikipediaSource,
  youtube: youtubeSource,
} satisfies Record<string, ContentSource>;

const allSources: ContentSource[] = getSubmitSourceCatalog().map(entry => {
  const source = sourceImplementations[entry.sourceName as keyof typeof sourceImplementations];
  if (!source) {
    throw new Error(`Missing source implementation for ${entry.sourceName}`);
  }

  return source;
});

export function getAllSources(): ContentSource[] {
  return allSources;
}
