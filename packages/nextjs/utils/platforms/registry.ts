import { genericHandler } from "./handlers/generic";
import { youtubeHandler } from "./handlers/youtube";
import type { PlatformHandler, PlatformInfo } from "./types";

/**
 * Supported platform handlers (in priority order).
 */
const handlers: PlatformHandler[] = [youtubeHandler, genericHandler];

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
