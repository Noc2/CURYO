import { log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 9n; // Crypto Tokens

// Map CoinGecko category strings to on-chain subcategory names
const CATEGORY_MAP: Record<string, string> = {
  "layer-1": "Layer 1",
  "layer-2": "Layer 2",
  "decentralized-finance-defi": "DeFi",
  "decentralized-exchange": "DeFi",
  "lending-borrowing": "DeFi",
  "yield-farming": "DeFi",
  "non-fungible-tokens-nft": "Gaming/NFT",
  "gaming": "Gaming/NFT",
  "play-to-earn": "Gaming/NFT",
  "meme-token": "Memecoins",
  "dog-themed-coins": "Memecoins",
  "privacy-coins": "Privacy",
  "stablecoins": "Stablecoins",
};

function matchSubcategory(categories: string[]): string {
  for (const cat of categories) {
    const lower = cat.toLowerCase().replace(/ /g, "-");
    for (const [key, value] of Object.entries(CATEGORY_MAP)) {
      if (lower.includes(key)) return value;
    }
  }
  return "Layer 1";
}

export const coinGeckoSource: ContentSource = {
  name: "coingecko",
  categoryId: CATEGORY_ID,

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    try {
      const res = await fetchWithTimeout(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`,
      );
      if (!res.ok) {
        log.warn(`CoinGecko API error: ${res.status}`);
        return [];
      }

      const coins = await res.json();
      const items: ContentItem[] = [];

      for (const coin of coins) {
        const slug = coin.id;
        const title = truncateContentTitle(coin.name);
        const marketCap = coin.market_cap
          ? `Market cap: $${(coin.market_cap / 1e9).toFixed(2)}B`
          : "";
        const priceStr = coin.current_price
          ? `Price: $${coin.current_price.toLocaleString()}`
          : "";
        const description = truncateContentDescription(
          `${coin.name} (${coin.symbol.toUpperCase()}). ${priceStr}. ${marketCap}. Rank #${coin.market_cap_rank || "N/A"}.`,
        );

        // CoinGecko markets endpoint doesn't return categories, so infer from common knowledge
        // For a more accurate mapping, we'd need individual coin detail calls
        const tag = "Layer 1";

        items.push({
          url: `https://www.coingecko.com/en/coins/${slug}`,
          title,
          description,
          tags: tag,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`CoinGecko source error: ${err.message}`);
      return [];
    }
  },
};
