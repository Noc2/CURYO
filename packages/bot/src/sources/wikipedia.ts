import { log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 5n;

// Map Wikidata occupation (P106) QIDs to on-chain subcategory names
const OCCUPATION_MAP: Record<string, string> = {
  Q2066131: "Athletes", // athlete
  Q937857: "Athletes", // football player
  Q3665646: "Athletes", // basketball player
  Q10843263: "Athletes", // tennis player
  Q177220: "Musicians", // singer
  Q639669: "Musicians", // musician
  Q36834: "Musicians", // composer
  Q82955: "Politicians", // politician
  Q901: "Scientists", // scientist
  Q169470: "Scientists", // physicist
  Q593644: "Scientists", // chemist
  Q33999: "Actors", // actor
  Q10800557: "Actors", // film actor
  Q131524: "Business", // entrepreneur
  Q43845: "Business", // businessperson
  Q483501: "Artists", // artist
  Q1028181: "Artists", // painter
  Q36180: "Authors", // writer
  Q49757: "Authors", // poet
};

async function isPersonArticle(title: string): Promise<string | null> {
  // Use Wikidata to check if this is a person and get their occupation
  try {
    const res = await fetchWithTimeout(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&sites=enwiki&titles=${encodeURIComponent(title)}&props=claims&format=json`,
    );
    if (!res.ok) return null;

    const data = await res.json();
    const entities = data.entities;
    const entity = Object.values(entities)[0] as any;
    if (!entity?.claims) return null;

    // Check P31 (instance of) = Q5 (human)
    const instanceOf = entity.claims.P31;
    if (!instanceOf) return null;
    const isHuman = instanceOf.some(
      (claim: any) => claim.mainsnak?.datavalue?.value?.id === "Q5",
    );
    if (!isHuman) return null;

    // Get occupation from P106
    const occupations = entity.claims.P106 || [];
    for (const claim of occupations) {
      const qid = claim.mainsnak?.datavalue?.value?.id;
      if (qid && OCCUPATION_MAP[qid]) {
        return OCCUPATION_MAP[qid];
      }
    }

    return "Athletes"; // Default subcategory for people with no matched occupation
  } catch {
    return null;
  }
}

export const wikipediaSource: ContentSource = {
  name: "wikipedia-people",
  categoryId: CATEGORY_ID,

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    try {
      // Get most viewed pages from yesterday
      const yesterday = new Date(Date.now() - 86400000);
      const year = yesterday.getFullYear();
      const month = String(yesterday.getMonth() + 1).padStart(2, "0");
      const day = String(yesterday.getDate()).padStart(2, "0");

      const res = await fetchWithTimeout(
        `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia/all-access/${year}/${month}/${day}`,
      );
      if (!res.ok) {
        log.warn(`Wikipedia pageviews API error: ${res.status}`);
        return [];
      }

      const data = await res.json();
      const articles = data.items?.[0]?.articles ?? [];
      const items: ContentItem[] = [];

      // Filter out special pages and check each for person status
      for (const article of articles) {
        if (items.length >= limit) break;

        const title = article.article;
        const normalizedTitle = truncateContentTitle(title.replace(/_/g, " "));
        // Skip special/meta pages
        if (
          title === "Main_Page" ||
          title.startsWith("Special:") ||
          title.startsWith("Wikipedia:") ||
          title.startsWith("Portal:") ||
          title.includes("/")
        ) {
          continue;
        }

        const subcategory = await isPersonArticle(title);
        if (!subcategory) continue;

        // Get article summary for description
        let description = normalizedTitle;
        try {
          const summaryRes = await fetchWithTimeout(
            `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
          );
          if (summaryRes.ok) {
            const summary = await summaryRes.json();
            description = truncateContentDescription(summary.extract || description);
          }
        } catch {
          // Use title as fallback
        }

        items.push({
          url: `https://en.wikipedia.org/wiki/${title}`,
          title: normalizedTitle,
          description,
          tags: subcategory,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`Wikipedia source error: ${err.message}`);
      return [];
    }
  },
};
