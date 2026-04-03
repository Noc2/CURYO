import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import { detectPlatform } from "~~/utils/platforms";
import type { PlatformType } from "~~/utils/platforms/types";

const HIGH_RES_QUEUE_THUMBNAIL_PLATFORMS = new Set<PlatformType>(["coingecko"]);

interface ThumbnailSourceItem {
  url: string;
  thumbnailUrl: string | null;
  contentMetadata?: ContentMetadataResult;
}

export function getPreferredQueueThumbnailUrl(item: ThumbnailSourceItem): string | null {
  const platform = detectPlatform(item.url);
  const defaultThumbnailUrl = item.contentMetadata?.thumbnailUrl ?? item.thumbnailUrl ?? platform.thumbnailUrl;

  if (HIGH_RES_QUEUE_THUMBNAIL_PLATFORMS.has(platform.type)) {
    return item.contentMetadata?.imageUrl ?? defaultThumbnailUrl;
  }

  return defaultThumbnailUrl ?? item.contentMetadata?.imageUrl ?? null;
}
