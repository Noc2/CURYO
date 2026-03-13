import { log } from "../config.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 10n; // MTG Cards

// Map card legalities to preferred on-chain subcategory
function getSubcategory(legalities: Record<string, string>): string {
  if (legalities.commander === "legal") return "Commander";
  if (legalities.standard === "legal") return "Standard";
  if (legalities.modern === "legal") return "Modern";
  if (legalities.pioneer === "legal") return "Pioneer";
  if (legalities.legacy === "legal") return "Legacy";
  if (legalities.vintage === "legal") return "Vintage";
  if (legalities.pauper === "legal") return "Pauper";
  return "Commander";
}

export const scryfallSource: ContentSource = {
  name: "scryfall",
  categoryId: CATEGORY_ID,

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    try {
      // Fetch recently released notable cards
      const res = await fetchWithTimeout(
        `https://api.scryfall.com/cards/search?q=is:new+is:firstprint&order=released&dir=desc&unique=cards`,
        15_000,
        { headers: { "User-Agent": "CuryoBot/1.0" } },
      );
      if (!res.ok) {
        log.warn(`Scryfall API error: ${res.status}`);
        return [];
      }

      const data = await res.json();
      const items: ContentItem[] = [];

      for (const card of (data.data ?? []).slice(0, limit)) {
        const set = card.set;
        const collectorNumber = card.collector_number;
        const tag = getSubcategory(card.legalities || {});

        const typeLine = card.type_line || "Card";
        const manaCost = card.mana_cost || "";
        const description = `${card.name} — ${typeLine} ${manaCost}. Set: ${card.set_name || set}.`.slice(0, 500);

        items.push({
          url: `https://scryfall.com/card/${set}/${collectorNumber}/${encodeURIComponent(card.name.toLowerCase().replace(/ /g, "-"))}`,
          title: card.name,
          description,
          tags: tag,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`Scryfall source error: ${err.message}`);
      return [];
    }
  },
};
