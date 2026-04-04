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
    .filter((url): url is string => typeof url === "string")
    .map(url => url.trim())
    .filter(url => url.length > 0);

  return [...new Set(urls)];
}

export function getImageLoadState(image: ImageLoadSnapshot | null): "pending" | "loaded" | "error" {
  if (!image || !image.complete) return "pending";
  return image.naturalWidth > 0 ? "loaded" : "error";
}
