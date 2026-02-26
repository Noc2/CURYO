import type { RatingStrategy } from "./types.js";

function extractYoutubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("youtube.com")) {
      return parsed.searchParams.get("v");
    }
    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }
    return null;
  } catch {
    return null;
  }
}

export const youtubeStrategy: RatingStrategy = {
  name: "youtube",

  canRate: (url) => extractYoutubeVideoId(url) !== null,

  async getScore(url) {
    const videoId = extractYoutubeVideoId(url);
    if (!videoId) return null;

    try {
      // Use the Return YouTube Dislike community API (free, no auth)
      const res = await fetch(
        `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`,
      );
      if (!res.ok) return null;

      const data = await res.json();
      const likes = data.likes ?? 0;
      const dislikes = data.dislikes ?? 0;
      const total = likes + dislikes;

      if (total === 0) return null;

      // Like ratio → 0-10 scale
      return (likes / total) * 10;
    } catch {
      return null;
    }
  },
};
