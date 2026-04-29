interface BundleFeedItem {
  id: bigint;
  bundleId?: bigint | null;
  bundleIndex?: number | null;
}

const MISSING_BUNDLE_INDEX = Number.MAX_SAFE_INTEGER;

function getBundleKey(item: BundleFeedItem) {
  return item.bundleId === null || item.bundleId === undefined ? null : item.bundleId.toString();
}

function getBundleIndex(item: BundleFeedItem) {
  return typeof item.bundleIndex === "number" && Number.isFinite(item.bundleIndex)
    ? item.bundleIndex
    : MISSING_BUNDLE_INDEX;
}

function compareBundleMembers(a: BundleFeedItem, b: BundleFeedItem) {
  const indexDifference = getBundleIndex(a) - getBundleIndex(b);
  if (indexDifference !== 0) return indexDifference;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

export function orderBundleMembersInFeed<TItem extends BundleFeedItem>(items: readonly TItem[]) {
  const bundleItems = new Map<string, TItem[]>();

  for (const item of items) {
    const bundleKey = getBundleKey(item);
    if (!bundleKey) continue;
    bundleItems.set(bundleKey, [...(bundleItems.get(bundleKey) ?? []), item]);
  }

  const emittedContentIds = new Set<string>();
  const orderedItems: TItem[] = [];

  for (const item of items) {
    const contentId = item.id.toString();
    if (emittedContentIds.has(contentId)) continue;

    const bundleKey = getBundleKey(item);
    const siblings = bundleKey ? bundleItems.get(bundleKey) : null;

    if (!siblings || siblings.length <= 1) {
      orderedItems.push(item);
      emittedContentIds.add(contentId);
      continue;
    }

    for (const sibling of [...siblings].sort(compareBundleMembers)) {
      const siblingContentId = sibling.id.toString();
      if (emittedContentIds.has(siblingContentId)) continue;
      orderedItems.push(sibling);
      emittedContentIds.add(siblingContentId);
    }
  }

  return orderedItems;
}
