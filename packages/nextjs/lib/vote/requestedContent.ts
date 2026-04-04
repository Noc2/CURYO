import type { ContentItem } from "~~/hooks/useContentFeed";
import { isContentItemBlocked } from "~~/utils/contentFilter";

export function mergeRequestedContentIntoFeed(
  items: readonly ContentItem[],
  requestedItem: ContentItem | null | undefined,
) {
  if (!requestedItem) {
    return [...items];
  }

  if (isContentItemBlocked(requestedItem)) {
    return [...items];
  }

  if (items.some(item => item.id === requestedItem.id)) {
    return [...items];
  }

  return [requestedItem, ...items];
}
