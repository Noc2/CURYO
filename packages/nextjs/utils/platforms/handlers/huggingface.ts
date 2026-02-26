import type { PlatformHandler, PlatformInfo } from "../types";

/**
 * Extract org/model path from HuggingFace model URLs.
 * Supported formats:
 *  - https://huggingface.co/Qwen/Qwen3.5-397B-A17B
 *  - https://www.huggingface.co/deepseek-ai/DeepSeek-V3
 *  - https://huggingface.co/meta-llama/Llama-3.3-70B-Instruct (with trailing segments)
 */
function extractHuggingFaceModel(url: string): { modelId: string; author: string } | null {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith("huggingface.co")) {
      return null;
    }

    // Match /{org}/{model} path segments
    const pathMatch = parsed.pathname.match(/^\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9._-]+)/);
    if (!pathMatch) return null;

    const org = pathMatch[1];
    const model = pathMatch[2];

    // Exclude HuggingFace site pages that aren't model repos
    const reservedPaths = new Set([
      "docs",
      "spaces",
      "datasets",
      "models",
      "tasks",
      "blog",
      "pricing",
      "enterprise",
      "login",
      "join",
      "settings",
      "notifications",
      "papers",
    ]);
    if (reservedPaths.has(org)) return null;

    return { modelId: `${org}/${model}`, author: org };
  } catch {
    return null;
  }
}

export const huggingfaceHandler: PlatformHandler = {
  matches(url: string): boolean {
    return extractHuggingFaceModel(url) !== null;
  },

  extract(url: string): PlatformInfo {
    const result = extractHuggingFaceModel(url);

    return {
      type: "huggingface",
      id: result?.modelId ?? null,
      url,
      thumbnailUrl: null, // Fetched async via /api/thumbnail
      embedUrl: null,
      metadata: result ? { author: result.author, modelId: result.modelId } : undefined,
    };
  },

  getThumbnail(): string | null {
    return null;
  },

  getEmbedUrl(): string | null {
    return null;
  },

  getCanonicalUrl(url: string): string {
    const result = extractHuggingFaceModel(url);
    return result ? `https://huggingface.co/${result.modelId}` : url;
  },
};
