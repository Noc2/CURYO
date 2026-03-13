import { fetchWithTimeout } from "../utils.js";
import type { RatingStrategy } from "./types.js";

function extractHuggingFaceModelId(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("huggingface.co")) return null;
    // Model URLs look like: huggingface.co/org/model-name
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      return parts.slice(0, 2).join("/");
    }
    return null;
  } catch {
    return null;
  }
}

export const huggingFaceStrategy: RatingStrategy = {
  name: "huggingface",

  canRate: (url) => extractHuggingFaceModelId(url) !== null,

  async getScore(url) {
    const modelId = extractHuggingFaceModelId(url);
    if (!modelId) return null;

    try {
      const res = await fetchWithTimeout(`https://huggingface.co/api/models/${modelId}`);
      if (!res.ok) return null;

      const data = await res.json();
      const likes = data.likes ?? 0;

      if (likes === 0) return null;

      // Log scale: 1 like → 0, 10 → 2, 100 → 4, 1000 → 6, 10000 → 8, 100000 → 10
      return Math.min(10, Math.log10(likes + 1) * 2);
    } catch {
      return null;
    }
  },
};
