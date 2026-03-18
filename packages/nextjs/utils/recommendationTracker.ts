"use client";

import type { ContentItem } from "~~/hooks/useContentFeed";
import { type PlatformType, detectPlatform } from "~~/utils/platforms";

const RECOMMENDATION_SIGNAL_STORAGE_KEY = "curyo_recommendation_signals";
const MAX_RECOMMENDATION_SIGNALS = 800;

export type RecommendationSignalType =
  | "impression"
  | "card_open"
  | "dwell"
  | "quick_skip"
  | "external_open"
  | "watch_toggle"
  | "follow_toggle"
  | "vote_intent"
  | "vote_commit";

export interface RecommendationSignalContext {
  contentId: string;
  categoryId: string;
  url: string;
  platform: PlatformType;
  submitter: string;
  tags: string[];
}

export interface RecommendationSignalEvent extends RecommendationSignalContext {
  type: RecommendationSignalType;
  timestamp: number;
  dwellMs?: number;
  selected?: boolean;
  isUp?: boolean;
}

export function buildRecommendationSignalContext(
  item: Pick<ContentItem, "id" | "categoryId" | "url" | "submitter" | "tags">,
): RecommendationSignalContext {
  return {
    contentId: item.id.toString(),
    categoryId: item.categoryId.toString(),
    url: item.url,
    platform: detectPlatform(item.url).type,
    submitter: item.submitter.toLowerCase(),
    tags: item.tags.map(tag => tag.toLowerCase()).slice(0, 8),
  };
}

export function getRecommendationSignals(): RecommendationSignalEvent[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(RECOMMENDATION_SIGNAL_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as RecommendationSignalEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function trackRecommendationSignal(
  context: RecommendationSignalContext,
  type: RecommendationSignalType,
  fields: Pick<RecommendationSignalEvent, "dwellMs" | "selected" | "isUp"> = {},
): void {
  if (typeof window === "undefined") return;

  try {
    const events = getRecommendationSignals();
    events.push({
      ...context,
      type,
      timestamp: Date.now(),
      ...fields,
    });

    const trimmed = events.length > MAX_RECOMMENDATION_SIGNALS ? events.slice(-MAX_RECOMMENDATION_SIGNALS) : events;
    localStorage.setItem(RECOMMENDATION_SIGNAL_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be unavailable or full.
  }
}
