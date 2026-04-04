"use client";

import type { ContentItem } from "~~/hooks/useContentFeed";

export const DISCOVER_ALL_FILTER = "All";
export const DISCOVER_BROKEN_FILTER = "Broken";

export function filterDiscoverCategoryItems(
  feed: ContentItem[],
  activeCategory: string,
  activeCategoryId?: bigint,
): ContentItem[] {
  let items = [...feed];

  if (activeCategory === DISCOVER_BROKEN_FILTER) {
    items = items.filter(item => item.isValidUrl === false);
  } else {
    items = items.filter(item => item.isValidUrl !== false);
  }

  if (
    activeCategory !== DISCOVER_ALL_FILTER &&
    activeCategory !== DISCOVER_BROKEN_FILTER &&
    activeCategoryId === undefined
  ) {
    items = items.filter(item => item.tags.includes(activeCategory));
  }

  return items;
}
