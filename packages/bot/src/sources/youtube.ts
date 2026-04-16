import { config, log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 5n;

// Map YouTube video category IDs to on-chain subcategory names
const YOUTUBE_CATEGORY_MAP: Record<number, string> = {
  1: "Entertainment", // Film & Animation
  2: "Entertainment", // Autos & Vehicles
  10: "Music",
  15: "Entertainment", // Pets & Animals
  17: "Sports",
  19: "Lifestyle", // Travel & Events
  20: "Gaming",
  22: "Entertainment", // People & Blogs
  23: "Entertainment", // Comedy
  24: "Entertainment",
  25: "News",
  26: "Lifestyle", // Howto & Style
  27: "Education",
  28: "Science", // Science & Technology
  29: "Entertainment", // Nonprofits & Activism
};

export const youtubeSource: ContentSource = {
  name: "youtube",
  categoryId: CATEGORY_ID,
  categoryName: "Media",

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    if (!config.youtubeApiKey) {
      log.debug("YouTube source skipped: YOUTUBE_API_KEY not set");
      return [];
    }

    try {
      const res = await fetchWithTimeout(
        `https://www.googleapis.com/youtube/v3/videos?chart=mostPopular&regionCode=US&maxResults=${limit}&part=snippet&key=${config.youtubeApiKey}`,
      );
      if (!res.ok) {
        log.warn(`YouTube API error: ${res.status} ${res.statusText}`);
        return [];
      }

      const data = await res.json();
      const items: ContentItem[] = [];

      for (const video of data.items ?? []) {
        const snippet = video.snippet;
        const categoryNum = parseInt(snippet.categoryId || "0");
        const tag = YOUTUBE_CATEGORY_MAP[categoryNum] || "Entertainment";
        const title = truncateContentTitle(snippet.title);

        items.push({
          url: `https://www.youtube.com/watch?v=${video.id}`,
          title,
          description: truncateContentDescription(snippet.description || title),
          tags: tag,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`YouTube source error: ${err.message}`);
      return [];
    }
  },
};
