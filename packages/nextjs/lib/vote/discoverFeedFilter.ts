"use client";

import type { ContentItem } from "~~/hooks/useContentFeed";

export const DISCOVER_ALL_FILTER = "All";
export const DISCOVER_BROKEN_FILTER = "Broken";

export function filterDiscoverFeedItems(feed: ContentItem[], activeFilter: string): ContentItem[] {
  let items = [...feed];

  if (activeFilter === DISCOVER_BROKEN_FILTER) {
    items = items.filter(item => item.isValidUrl === false);
  } else {
    items = items.filter(item => item.isValidUrl !== false);
  }

  return items;
}
