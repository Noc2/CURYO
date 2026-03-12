import { log } from "../config.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 11n; // Crypto

// Map CoinGecko category strings to on-chain subcategory names
const CATEGORY_MAP: Record<string, string> = {
  "layer-1": "Layer 1",
  "layer-2": "Layer 2",
  "decentralized-finance-defi": "DeFi",
  "decentralized-exchange": "DeFi",
  "lending-borrowing": "DeFi",
  "yield-farming": "DeFi",
  "non-fungible-tokens-nft": "NFT",
  "gaming": "Gaming",
  "play-to-earn": "Gaming",
  "meme-token": "Meme",
  "dog-themed-coins": "Meme",
  "privacy-coins": "Privacy",
  "stablecoins": "Stablecoin",
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
      const res = await fetch(
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
        const marketCap = coin.market_cap
          ? `Market cap: $${(coin.market_cap / 1e9).toFixed(2)}B`
          : "";
        const priceStr = coin.current_price
          ? `Price: $${coin.current_price.toLocaleString()}`
          : "";
        const description =
          `${coin.name} (${coin.symbol.toUpperCase()}). ${priceStr}. ${marketCap}. Rank #${coin.market_cap_rank || "N/A"}.`.slice(
            0,
            500,
          );

        // CoinGecko markets endpoint doesn't return categories, so infer from common knowledge
        // For a more accurate mapping, we'd need individual coin detail calls
        const tag = "Layer 1";

        items.push({
          url: `https://www.coingecko.com/en/coins/${slug}`,
          title: coin.name,
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
