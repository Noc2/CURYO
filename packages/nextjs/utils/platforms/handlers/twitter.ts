import type { PlatformHandler, PlatformInfo } from "../types";

/**
 * Extract tweet ID and username from Twitter/X URL formats.
 * Supported:
 *  - https://twitter.com/{username}/status/{tweetId}
 *  - https://x.com/{username}/status/{tweetId}
 *  - https://www.twitter.com/{username}/status/{tweetId}
 *  - https://www.x.com/{username}/status/{tweetId}
 */
function extractTweetInfo(url: string): { tweetId: string; username: string } | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname !== "twitter.com" && hostname !== "x.com") return null;

    const match = parsed.pathname.match(/^\/([a-zA-Z0-9_]+)\/status\/(\d+)/);
    if (!match) return null;

    return { username: match[1], tweetId: match[2] };
  } catch {
    return null;
  }
}

export const twitterHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractTweetInfo(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const result = extractTweetInfo(url);
    return {
      type: "twitter",
      id: result?.tweetId ?? null,
      url,
      thumbnailUrl: null,
      embedUrl: null,
      metadata: result ? { username: result.username, tweetId: result.tweetId } : undefined,
    };
  },

  getThumbnail(): string | null {
    return null;
  },

  getEmbedUrl(): string | null {
    return null;
  },

  getCanonicalUrl(url: string): string {
    const result = extractTweetInfo(url);
    return result ? `https://x.com/${result.username}/status/${result.tweetId}` : url;
  },
};
