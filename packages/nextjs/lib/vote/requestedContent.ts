import type { ContentItem } from "~~/hooks/useContentFeed";

export function mergeRequestedContentIntoFeed(
  items: readonly ContentItem[],
  requestedItem: ContentItem | null | undefined,
) {
  if (!requestedItem) {
    return [...items];
  }

  if (items.some(item => item.id === requestedItem.id)) {
    return [...items];
  }

  return [requestedItem, ...items];
}
