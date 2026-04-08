import { log } from "../config.js";
import { truncateContentDescription, truncateContentTitle } from "../contentLimits.js";
import { fetchWithTimeout } from "../utils.js";
import type { ContentSource, ContentItem } from "./types.js";

const CATEGORY_ID = 8n;

// Map HuggingFace pipeline_tag to on-chain subcategory names
const PIPELINE_MAP: Record<string, string> = {
  "text-generation": "Chatbots",
  "text2text-generation": "Writing",
  "conversational": "Chatbots",
  "text-to-image": "Image Generation",
  "image-to-image": "Image Generation",
  "image-to-text": "Image Generation",
  "text-classification": "Research",
  "token-classification": "Research",
  "question-answering": "Chatbots",
  "summarization": "Writing",
  "translation": "Writing",
  "fill-mask": "Research",
  "text-to-speech": "Music",
  "automatic-speech-recognition": "Productivity",
  "audio-classification": "Music",
  "text-to-audio": "Music",
  "text-to-video": "Video",
  "image-classification": "Research",
  "object-detection": "Research",
  "image-segmentation": "Research",
  "depth-estimation": "Research",
  "feature-extraction": "Research",
  "sentence-similarity": "Research",
  "zero-shot-classification": "Research",
  "reinforcement-learning": "Agents",
};

export const huggingFaceSource: ContentSource = {
  name: "huggingface",
  categoryId: CATEGORY_ID,
  categoryName: "AI",

  async fetchTrending(limit: number): Promise<ContentItem[]> {
    try {
      const params = new URLSearchParams({
        direction: "-1",
        limit: String(limit),
        sort: "trendingScore",
      });
      const res = await fetchWithTimeout(`https://huggingface.co/api/models?${params.toString()}`);
      if (!res.ok) {
        log.warn(`HuggingFace API error: ${res.status}`);
        return [];
      }

      const models = await res.json();
      const items: ContentItem[] = [];

      for (const model of models) {
        const modelId = model.modelId || model.id;
        if (!modelId) continue;
        const title = truncateContentTitle(modelId);

        const pipelineTag = model.pipeline_tag || "";
        const tag = PIPELINE_MAP[pipelineTag] || "Research";

        const likes = model.likes || 0;
        const downloads = model.downloads || 0;
        const description = truncateContentDescription(
          `${modelId} — ${pipelineTag || "AI model"}. ${likes} likes, ${downloads.toLocaleString()} downloads.`,
        );

        items.push({
          url: `https://huggingface.co/${modelId}`,
          title,
          description,
          tags: tag,
          categoryId: CATEGORY_ID,
        });
      }

      return items;
    } catch (err: any) {
      log.warn(`HuggingFace source error: ${err.message}`);
      return [];
    }
  },
};
