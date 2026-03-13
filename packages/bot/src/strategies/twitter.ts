import { fetchWithTimeout } from "../utils.js";
import type { RatingStrategy } from "./types.js";

function extractTweetId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (hostname !== "twitter.com" && hostname !== "x.com") return null;
    const match = parsed.pathname.match(/^\/[a-zA-Z0-9_]+\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function getToken(id: string): string {
  return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export const twitterStrategy: RatingStrategy = {
  name: "twitter",

  canRate: (url: string) => extractTweetId(url) !== null,

  async getScore(url: string): Promise<number | null> {
    const tweetId = extractTweetId(url);
    if (!tweetId) return null;

    try {
      const token = getToken(tweetId);
      const res = await fetchWithTimeout(
        `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&lang=en&token=${token}`,
      );
      if (!res.ok) return null;

      const data = await res.json();
      if (!data || data.__typename === "TweetTombstone") return null;

      const likes: number = data.favorite_count ?? 0;
      const replies: number = data.conversation_count ?? 0;
      const retweets: number = data.retweet_count ?? 0;

      const totalEngagement = likes + retweets + replies;
      if (totalEngagement === 0) return null;

      // Engagement quality: higher ratio of likes+retweets vs replies = better
      const positiveRatio = (likes + retweets) / totalEngagement;

      // Volume factor: log10 scaling, capped at 1.0
      const volumeFactor = Math.min(Math.log10(Math.max(totalEngagement, 1)) / 6, 1.0);

      // Weighted score: 70% quality, 30% volume
      const score = positiveRatio * 7 + volumeFactor * 3;

      return Math.min(Math.max(score, 0), 10);
    } catch {
      return null;
    }
  },
};
