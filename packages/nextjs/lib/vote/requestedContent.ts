import type { ContentItem } from "~~/hooks/useContentFeed";

export function mergeRequestedContentIntoFeed(
  items: readonly ContentItem[],
  requestedItem: ContentItem | null | undefined,
) {
  if (!requestedItem) {
    return [...items];
  }

  return [requestedItem, ...items.filter(item => item.id !== requestedItem.id)];
}
