import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";

const PREFETCH_FIRST_EMBED_TYPES = new Set([
  "coingecko",
  "github",
  "huggingface",
  "openlibrary",
  "rawg",
  "tmdb",
  "wikipedia",
]);

export function shouldWaitForPrefetchedMetadata(
  platformType: string,
  deferClientFetch: boolean,
  prefetchedMetadata?: ContentMetadataResult,
): boolean {
  return deferClientFetch && prefetchedMetadata === undefined && PREFETCH_FIRST_EMBED_TYPES.has(platformType);
}

export function getEmbedImageLoadingProps(compact = false) {
  return {
    loading: compact ? ("lazy" as const) : ("eager" as const),
    fetchPriority: compact ? ("auto" as const) : ("high" as const),
    decoding: "async" as const,
  };
}
