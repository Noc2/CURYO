import { log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 3n; // Magic: The Gathering

// Match the deployed MTG subcategories, which are based on card types.
function getSubcategory(typeLine: string, legalities: Record<string, string>): string {
  if (typeLine.includes("Instant")) return "Instants";
  if (typeLine.includes("Sorcery")) return "Sorceries";
  if (typeLine.includes("Enchantment")) return "Enchantments";
  if (typeLine.includes("Artifact")) return "Artifacts";
  if (typeLine.includes("Land")) return "Lands";
  if (typeLine.includes("Planeswalker")) return "Planeswalkers";
  if (typeLine.includes("Legendary Creature") && legalities.commander === "legal") return "Commanders";
  if (typeLine.includes("Creature")) return "Creatures";
  return legalities.commander === "legal" ? "Commanders" : "Creatures";
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
        const tag = getSubcategory(card.type_line || "", card.legalities || {});
        const title = truncateContentTitle(card.name);

        const typeLine = card.type_line || "Card";
        const manaCost = card.mana_cost || "";
        const description = truncateContentDescription(
          `${title} — ${typeLine} ${manaCost}. Set: ${card.set_name || set}.`,
        );

        items.push({
          url: `https://scryfall.com/card/${set}/${collectorNumber}/${encodeURIComponent(card.name.toLowerCase().replace(/ /g, "-"))}`,
          title,
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
