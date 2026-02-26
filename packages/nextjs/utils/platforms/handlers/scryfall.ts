import type { PlatformHandler, PlatformInfo } from "../types";

interface ScryfallCardInfo {
  set: string;
  collectorNumber: string;
  cardName: string;
}

function extractScryfallCard(url: string): ScryfallCardInfo | null {
  try {
    const parsed = new URL(url);

    // scryfall.com/card/{set}/{collector_number}/{card_name}
    if (parsed.hostname === "scryfall.com" && parsed.pathname.startsWith("/card/")) {
      const parts = parsed.pathname.split("/").filter(Boolean);
      // parts: ["card", "lea", "232", "black-lotus"]
      if (parts.length >= 4) {
        return {
          set: parts[1],
          collectorNumber: parts[2],
          cardName: parts[3],
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export const scryfallHandler: PlatformHandler = {
  matches(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === "scryfall.com" && parsed.pathname.startsWith("/card/");
    } catch {
      return false;
    }
  },

  extract(url: string): PlatformInfo {
    const card = extractScryfallCard(url);
    const id = card ? `${card.set}/${card.collectorNumber}` : null;
    // Scryfall API: border_crop removes white edges and most of the card border
    const imageUrl = card
      ? `https://api.scryfall.com/cards/${card.set}/${card.collectorNumber}?format=image&version=border_crop`
      : null;

    return {
      type: "scryfall",
      id,
      url,
      thumbnailUrl: imageUrl,
      embedUrl: null, // No iframe embed for Scryfall
      metadata: card ? { cardName: card.cardName, set: card.set, collectorNumber: card.collectorNumber } : undefined,
    };
  },

  getThumbnail(info: PlatformInfo, quality = "border_crop"): string | null {
    if (!info.id) return null;
    return `https://api.scryfall.com/cards/${info.id}?format=image&version=${quality}`;
  },

  getEmbedUrl(): string | null {
    // Scryfall doesn't support iframe embedding
    return null;
  },

  getCanonicalUrl(url: string): string {
    const card = extractScryfallCard(url);
    return card ? `https://scryfall.com/card/${card.set}/${card.collectorNumber}/${card.cardName}` : url;
  },
};
