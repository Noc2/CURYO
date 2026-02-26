import type { PlatformHandler, PlatformInfo } from "../types";

/**
 * Extract coin slug from CoinGecko URL formats.
 * Supported formats:
 *  - https://www.coingecko.com/en/coins/bitcoin
 *  - https://coingecko.com/en/coins/ethereum
 *  - https://www.coingecko.com/coins/solana (without locale)
 */
function extractCoinGeckoSlug(url: string): string | null {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith("coingecko.com")) {
      return null;
    }

    // Match /en/coins/{slug} or /coins/{slug} (with optional locale prefix)
    const pathMatch = parsed.pathname.match(/^(?:\/[a-z]{2})?\/coins\/([a-z0-9-]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export const coingeckoHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractCoinGeckoSlug(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const coinId = extractCoinGeckoSlug(url);

    return {
      type: "coingecko",
      id: coinId,
      url,
      thumbnailUrl: null, // No predictable CDN pattern; fetched async via API
      embedUrl: null, // CoinGecko doesn't support iframe embedding
      metadata: coinId ? { coinId } : undefined,
    };
  },

  getThumbnail(): string | null {
    // CoinGecko thumbnail URLs are not predictable from the slug alone
    // (they use numeric IDs and variable filenames on their CDN).
    return null;
  },

  getEmbedUrl(): string | null {
    return null;
  },

  getCanonicalUrl(url: string): string {
    const slug = extractCoinGeckoSlug(url);
    return slug ? `https://www.coingecko.com/en/coins/${slug}` : url;
  },
};
