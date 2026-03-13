import { fetchWithTimeout } from "../utils.js";
import type { RatingStrategy } from "./types.js";

function extractOpenLibraryWorksKey(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("openlibrary.org")) return null;
    const match = parsed.pathname.match(/^(\/works\/OL\d+W)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export const openLibraryStrategy: RatingStrategy = {
  name: "openlibrary",

  canRate: (url) => extractOpenLibraryWorksKey(url) !== null,

  async getScore(url) {
    const worksKey = extractOpenLibraryWorksKey(url);
    if (!worksKey) return null;

    try {
      const res = await fetchWithTimeout(`https://openlibrary.org${worksKey}/ratings.json`);
      if (!res.ok) return null;

      const data = await res.json();
      const average = data.summary?.average;

      if (average === undefined || average === null || average === 0) return null;

      // Open Library uses 1-5 scale → multiply by 2 for 0-10
      return average * 2;
    } catch {
      return null;
    }
  },
};
