import { coingeckoHandler } from "./handlers/coingecko";
import { genericHandler } from "./handlers/generic";
import { githubHandler } from "./handlers/github";
import { huggingfaceHandler } from "./handlers/huggingface";
import { openLibraryHandler } from "./handlers/openlibrary";
import { rawgHandler } from "./handlers/rawg";
import { scryfallHandler } from "./handlers/scryfall";
import { spotifyHandler } from "./handlers/spotify";
import { tmdbHandler } from "./handlers/tmdb";
import { twitchHandler } from "./handlers/twitch";
import { twitterHandler } from "./handlers/twitter";
import { wikipediaHandler } from "./handlers/wikipedia";
import { youtubeHandler } from "./handlers/youtube";
import type { PlatformHandler, PlatformInfo } from "./types";

/**
 * Video platform handlers (in priority order).
 */
const videoHandlers: PlatformHandler[] = [youtubeHandler, twitchHandler];

/**
 * All handlers including generic fallback.
 */
const handlers: PlatformHandler[] = [
  ...videoHandlers,
  scryfallHandler,
  tmdbHandler,
  wikipediaHandler,
  rawgHandler,
  openLibraryHandler,
  coingeckoHandler,
  huggingfaceHandler,
  spotifyHandler,
  twitterHandler,
  githubHandler,
  genericHandler, // Always last as fallback
];

/**
 * Check if a URL is from a supported video platform.
 * Returns true only for YouTube and Twitch URLs.
 */
export function isSupportedVideoPlatform(url: string): boolean {
  for (const handler of videoHandlers) {
    if (handler.matches(url)) {
      return true;
    }
  }
  return false;
}

/**
 * Detect platform and extract info from a URL.
 * Returns platform info with type, ID, and available metadata.
 */
export function detectPlatform(url: string): PlatformInfo {
  for (const handler of handlers) {
    if (handler.matches(url)) {
      return handler.extract(url);
    }
  }
  return genericHandler.extract(url);
}

/**
 * Get thumbnail URL for a content URL.
 * Returns null if no thumbnail is available.
 */
export function getThumbnailUrl(url: string, quality?: string): string | null {
  const info = detectPlatform(url);
  const handler = handlers.find(h => h.matches(url)) ?? genericHandler;
  return handler.getThumbnail(info, quality);
}

/**
 * Canonicalize a URL for deduplication.
 * Uses the matching platform handler to produce a deterministic canonical form.
 */
export function canonicalizeUrl(url: string): string {
  const handler = handlers.find(h => h.matches(url)) ?? genericHandler;
  return handler.getCanonicalUrl(url);
}
