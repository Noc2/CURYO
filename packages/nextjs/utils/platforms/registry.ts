import { coingeckoHandler } from "./handlers/coingecko";
import { genericHandler } from "./handlers/generic";
import { huggingfaceHandler } from "./handlers/huggingface";
import { openLibraryHandler } from "./handlers/openlibrary";
import { rawgHandler } from "./handlers/rawg";
import { scryfallHandler } from "./handlers/scryfall";
import { tmdbHandler } from "./handlers/tmdb";
import { twitchHandler } from "./handlers/twitch";
import { twitterHandler } from "./handlers/twitter";
import { wikipediaHandler } from "./handlers/wikipedia";
import { youtubeHandler } from "./handlers/youtube";
import type { PlatformHandler, PlatformInfo } from "./types";

/**
 * List of supported video platform names for display purposes.
 */
export const SUPPORTED_VIDEO_PLATFORMS = ["YouTube", "Twitch"] as const;

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
  twitterHandler,
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
 * Check if a URL is from a supported embed platform (has inline embed support).
 */
export function isEmbeddable(url: string): boolean {
  const info = detectPlatform(url);
  return info.type !== "generic" && info.embedUrl !== null;
}

/**
 * Canonicalize a URL for deduplication.
 * Uses the matching platform handler to produce a deterministic canonical form.
 */
export function canonicalizeUrl(url: string): string {
  const handler = handlers.find(h => h.matches(url)) ?? genericHandler;
  return handler.getCanonicalUrl(url);
}
