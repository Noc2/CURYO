import { log } from "../config.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 7n;

// Map common subject keywords to on-chain subcategory names
const SUBJECT_MAP: Record<string, string> = {
  "fiction": "Fiction",
  "novel": "Fiction",
  "nonfiction": "Non-Fiction",
  "non-fiction": "Non-Fiction",
  "science fiction": "Science Fiction",
  "sci-fi": "Science Fiction",
  "fantasy": "Fantasy",
  "biography": "Biography",
  "autobiography": "Biography",
  "memoir": "Biography",
  "history": "History",
  "historical": "History",
  "science": "Science",
  "physics": "Science",
  "biology": "Science",
  "chemistry": "Science",
  "philosophy": "Philosophy",
  "ethics": "Philosophy",
};

function matchSubcategory(subjects: string[]): string {
  const joined = subjects.join(" ").toLowerCase();
  for (const [keyword, subcategory] of Object.entries(SUBJECT_MAP)) {
    if (joined.includes(keyword)) return subcategory;
  }
  return "Fiction";
}

export const openLibrarySource: ContentSource = {
  name: "openlibrary",
  categoryId: CATEGORY_ID,

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    try {
      const res = await fetch(`https://openlibrary.org/trending/daily.json?limit=${limit}`);
      if (!res.ok) {
        log.warn(`Open Library trending API error: ${res.status}`);
        return [];
      }

      const data = await res.json();
      const items: ContentItem[] = [];

      for (const work of data.works ?? []) {
        const worksKey = work.key; // e.g., "/works/OL123W"
        if (!worksKey) continue;

        const title = work.title || "Untitled";
        const authors = (work.author_name || []).join(", ");
        const subjects: string[] = work.subject || [];
        const tag = matchSubcategory(subjects);

        let description = authors ? `${title} by ${authors}` : title;
        if (work.first_publish_year) {
          description += ` (${work.first_publish_year})`;
        }

        items.push({
          url: `https://openlibrary.org${worksKey}`,
          title,
          description: description.slice(0, 500),
          tags: tag,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`Open Library source error: ${err.message}`);
      return [];
    }
  },
};
