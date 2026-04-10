interface OpenLibraryCoverMetadata {
  coverUrl?: string | null;
  imageUrl?: string | null;
  thumbnailUrl?: string | null;
}

export function getOpenLibraryCoverCandidates(metadata?: OpenLibraryCoverMetadata | null): string[] {
  const urls = [metadata?.coverUrl ?? metadata?.imageUrl, metadata?.thumbnailUrl]
    .filter((url): url is string => typeof url === "string")
    .map(url => url.trim())
    .filter(url => url.length > 0);

  return [...new Set(urls)];
}
