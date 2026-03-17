"use client";

import { useMemo } from "react";
import { type UseContentFeedOptions, mergeContentFeedMetadata } from "~~/hooks/contentFeed/shared";
import { useContentFeedMetadata } from "~~/hooks/useContentFeedMetadata";
import { useContentFeedQuery } from "~~/hooks/useContentFeedQuery";

export type { ContentItem, UseContentFeedOptions } from "~~/hooks/contentFeed/shared";

/**
 * Fetch the content feed.
 * Uses Ponder API when available, falls back to on-chain event scanning.
 */
export function useContentFeed(voterAddress?: string, options: UseContentFeedOptions = {}) {
  const { feed: baseFeed, isLoading, offset, totalContent, source } = useContentFeedQuery(voterAddress, options);
  const { metadataMap, validationMap } = useContentFeedMetadata(baseFeed);

  const feed = useMemo(
    () => mergeContentFeedMetadata(baseFeed, metadataMap, validationMap),
    [baseFeed, metadataMap, validationMap],
  );

  return {
    feed,
    isLoading,
    totalContent,
    hasMore: totalContent > offset + feed.length,
    source,
  };
}
