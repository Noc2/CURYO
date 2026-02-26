import { useMemo } from "react";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { getContentClicks } from "~~/utils/clickTracker";
import { getSalts } from "~~/utils/tlock";

export interface UserPreferences {
  categoryScores: Map<string, number>;
  hasPreferences: boolean;
}

export function useUserPreferences(feed: ContentItem[], address?: string): UserPreferences {
  return useMemo(() => {
    if (feed.length === 0) {
      return { categoryScores: new Map<string, number>(), hasPreferences: false };
    }

    // Build contentId -> categoryId lookup from feed
    const contentToCategory = new Map<string, string>();
    for (const item of feed) {
      contentToCategory.set(item.id.toString(), item.categoryId.toString());
    }

    const rawWeights = new Map<string, number>();

    // Vote salts (strongest signal)
    if (address) {
      const salts = getSalts(address);
      for (const salt of salts) {
        const categoryId = contentToCategory.get(salt.contentId);
        if (!categoryId || categoryId === "0") continue;

        const upBonus = salt.isUp ? 0.5 : 0;
        const stakeBonus = Math.min((salt.stakeAmount ?? 0) / 100, 1.0);
        const weight = 1.0 + upBonus + stakeBonus;

        rawWeights.set(categoryId, (rawWeights.get(categoryId) ?? 0) + weight);
      }
    }

    // Click history (weaker signal)
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
  }, [feed, address]);
}
