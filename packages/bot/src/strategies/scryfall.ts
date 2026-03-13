import { fetchWithTimeout } from "../utils.js";
import type { RatingStrategy } from "./types.js";

function extractScryfallCard(url: string): { set: string; number: string } | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("scryfall.com")) return null;
    const match = parsed.pathname.match(/^\/card\/([^/]+)\/([^/]+)/);
    return match ? { set: match[1], number: match[2] } : null;
  } catch {
    return null;
  }
}

export const scryfallStrategy: RatingStrategy = {
  name: "scryfall",

  canRate: (url) => extractScryfallCard(url) !== null,

  async getScore(url) {
    const card = extractScryfallCard(url);
    if (!card) return null;

    try {
      const res = await fetchWithTimeout(
        `https://api.scryfall.com/cards/${card.set}/${card.number}`,
        15_000,
        { headers: { "User-Agent": "CuryoBot/1.0" } },
      );
      if (!res.ok) return null;

      const data = await res.json();
      const priceStr = data.prices?.usd || data.prices?.usd_foil;

      if (!priceStr) return null;

      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) return null;

      // Price-based score using log scale:
      // $0.10 → ~1.5, $1 → ~3, $10 → ~6, $50 → ~8, $200 → ~10
      return Math.min(10, Math.log10(price * 10 + 1) * 3);
    } catch {
      return null;
    }
  },
};
