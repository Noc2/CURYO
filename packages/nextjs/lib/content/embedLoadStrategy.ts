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
const IMAGE_REQUIRED_PREFETCH_TYPES = new Set(["coingecko"]);

function hasImageMetadata(prefetchedMetadata: ContentMetadataResult): boolean {
  const imageUrls = [prefetchedMetadata.imageUrl, prefetchedMetadata.thumbnailUrl];
  return imageUrls.some(url => typeof url === "string" && url.trim().length > 0);
}

export function getUsablePrefetchedMetadata(
  platformType: string,
  prefetchedMetadata?: ContentMetadataResult,
): ContentMetadataResult | undefined {
  if (prefetchedMetadata === undefined) return undefined;

  if (IMAGE_REQUIRED_PREFETCH_TYPES.has(platformType) && !hasImageMetadata(prefetchedMetadata)) {
    return undefined;
  }

  return prefetchedMetadata;
}

export function shouldWaitForPrefetchedMetadata(
  platformType: string,
  deferClientFetch: boolean,
  prefetchedMetadata?: ContentMetadataResult,
): boolean {
  return deferClientFetch && prefetchedMetadata === undefined && PREFETCH_FIRST_EMBED_TYPES.has(platformType);
}

export function getEmbedImageLoadingProps(compact = false, isActive = !compact) {
  return {
    loading: isActive ? ("eager" as const) : ("lazy" as const),
    fetchPriority: isActive ? ("high" as const) : ("auto" as const),
    decoding: "async" as const,
  };
}
