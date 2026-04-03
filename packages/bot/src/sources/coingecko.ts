import { log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 9n; // Crypto Tokens

export const coinGeckoSource: ContentSource = {
  name: "coingecko",
  categoryId: CATEGORY_ID,
  categoryName: "Crypto Tokens",

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

        // The markets endpoint does not expose categories, so keep a stable default
        // unless we add slower per-coin detail lookups in the future.
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
