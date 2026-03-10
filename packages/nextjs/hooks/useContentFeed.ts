"use client";

import { useMemo } from "react";
import type { UseContentFeedOptions } from "~~/hooks/contentFeed/shared";
import { useContentFeedMetadata } from "~~/hooks/useContentFeedMetadata";
import { useContentFeedQuery } from "~~/hooks/useContentFeedQuery";

export type { ContentItem, UseContentFeedOptions } from "~~/hooks/contentFeed/shared";

/**
 * Fetch the content feed.
 * Uses Ponder API when available, falls back to on-chain event scanning.
 */
export function useContentFeed(voterAddress?: string, options: UseContentFeedOptions = {}) {
  const { feed: baseFeed, isLoading, offset, totalContent } = useContentFeedQuery(voterAddress, options);
  const { thumbnailMap, validationMap } = useContentFeedMetadata(baseFeed);

  const feed = useMemo(() => {
    return baseFeed.map(item => ({
      ...item,
      isValidUrl: validationMap[item.url] ?? item.isValidUrl,
      thumbnailUrl: thumbnailMap[item.url] ?? item.thumbnailUrl,
    }));
  }, [baseFeed, thumbnailMap, validationMap]);

  return {
    feed,
    isLoading,
    totalContent,
    hasMore: totalContent > offset + feed.length,
  };
}
