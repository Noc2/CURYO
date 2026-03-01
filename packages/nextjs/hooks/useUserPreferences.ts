import { useMemo } from "react";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { getContentClicks } from "~~/utils/clickTracker";

export interface UserPreferences {
  categoryScores: Map<string, number>;
  hasPreferences: boolean;
}

export function useUserPreferences(feed: ContentItem[], address?: string): UserPreferences {
  return useMemo(() => {
    if (feed.length === 0) {
      return { categoryScores: new Map<string, number>(), hasPreferences: false };
    }

    const rawWeights = new Map<string, number>();

    // Click history (primary signal now that vote data is on-chain)
    const clicks = getContentClicks();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const click of clicks) {
      if (click.categoryId === "0") continue;
      const weight = click.timestamp > sevenDaysAgo ? 0.3 : 0.15;
      rawWeights.set(click.categoryId, (rawWeights.get(click.categoryId) ?? 0) + weight);
    }

    if (rawWeights.size === 0) {
      return { categoryScores: new Map<string, number>(), hasPreferences: false };
    }

    // Normalize to 0-100 scale
    const maxWeight = Math.max(...rawWeights.values());
    const categoryScores = new Map<string, number>();
    for (const [catId, weight] of rawWeights) {
      categoryScores.set(catId, Math.round((weight / maxWeight) * 100));
    }

    return { categoryScores, hasPreferences: true };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed, address]);
}
