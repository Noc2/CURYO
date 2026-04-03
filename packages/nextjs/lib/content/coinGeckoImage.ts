interface CoinGeckoImageMetadata {
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

interface ImageLoadSnapshot {
  complete: boolean;
  naturalWidth: number;
}

export function getCoinGeckoImageCandidates(metadata?: CoinGeckoImageMetadata | null): string[] {
  const urls = [metadata?.imageUrl, metadata?.thumbnailUrl]
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map(url => url.trim());

  return [...new Set(urls)];
}

export function getImageLoadState(image: ImageLoadSnapshot | null): "pending" | "loaded" | "error" {
  if (!image || !image.complete) return "pending";
  return image.naturalWidth > 0 ? "loaded" : "error";
}
