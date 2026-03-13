import { fetchWithTimeout } from "../utils.js";
import type { RatingStrategy } from "./types.js";

function extractCoinGeckoSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("coingecko.com")) return null;
    const match = parsed.pathname.match(/\/coins\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export const coinGeckoStrategy: RatingStrategy = {
  name: "coingecko",

  canRate: (url) => extractCoinGeckoSlug(url) !== null,

  async getScore(url) {
    const coinId = extractCoinGeckoSlug(url);
    if (!coinId) return null;

    try {
      const res = await fetchWithTimeout(
        `https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
      );
      if (!res.ok) return null;

      const data = await res.json();
      const score = data.coingecko_score;

      if (score === undefined || score === null) return null;

      // CoinGecko score is 0-100, divide by 10 for 0-10
      return score / 10;
    } catch {
      return null;
    }
  },
};
