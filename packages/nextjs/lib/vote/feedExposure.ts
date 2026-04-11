"use client";

export const FEED_EXPOSURE_STORAGE_KEY = "curyo_feed_exposures";

const MAX_FEED_EXPOSURE_ENTRIES = 600;
const BASE_IGNORE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_IGNORE_TTL_MS = 7 * BASE_IGNORE_TTL_MS;
const DEFAULT_MIN_VISIBLE_ITEMS = 6;

export interface FeedExposureScope {
  chainId: string;
  viewerKey: string;
}

interface FeedExposureEntry {
  scopeKey: string;
  contentId: string;
  firstSeenAt: number;
  lastSeenAt: number;
  seenCount: number;
  ignoredCount: number;
  lastIgnoredAt?: number;
  lastPositiveAt?: number;
  lastVotedAt?: number;
}

interface FeedExposureRecordParams {
  contentId: bigint | string;
  hasPositiveInteraction: boolean;
  now?: number;
}

interface FeedPositiveInteractionParams {
  contentId: bigint | string;
  isVote?: boolean;
  now?: number;
}

interface ApplyFeedExposurePolicyOptions {
  enabled?: boolean;
  minVisibleItems?: number;
  now?: number;
  protectedContentIds?: readonly (bigint | string)[];
  scope: FeedExposureScope;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function getScopeKey(scope: FeedExposureScope) {
  return `${scope.chainId}:${scope.viewerKey}`;
}

function normalizeContentId(contentId: bigint | string) {
  return contentId.toString();
}

export function buildFeedExposureScope(params: {
  address?: string | null;
  chainId: number | string;
}): FeedExposureScope {
  const normalizedAddress = params.address?.trim().toLowerCase();
  return {
    chainId: params.chainId.toString(),
    viewerKey: normalizedAddress ? `wallet:${normalizedAddress}` : "anonymous",
  };
}

function readFeedExposureEntries(): FeedExposureEntry[] {
  const storage = getStorage();
  if (!storage) return [];

  try {
    const raw = storage.getItem(FEED_EXPOSURE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as FeedExposureEntry[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (entry): entry is FeedExposureEntry =>
        typeof entry?.scopeKey === "string" &&
        typeof entry.contentId === "string" &&
        typeof entry.firstSeenAt === "number" &&
        typeof entry.lastSeenAt === "number" &&
        typeof entry.seenCount === "number" &&
        typeof entry.ignoredCount === "number",
    );
  } catch {
    return [];
  }
}

function getEntryRecency(entry: FeedExposureEntry) {
  return Math.max(entry.lastSeenAt, entry.lastIgnoredAt ?? 0, entry.lastPositiveAt ?? 0, entry.lastVotedAt ?? 0);
}

function writeFeedExposureEntries(entries: FeedExposureEntry[]) {
  const storage = getStorage();
  if (!storage) return;

  try {
    const trimmed = [...entries]
      .sort((a, b) => getEntryRecency(b) - getEntryRecency(a))
      .slice(0, MAX_FEED_EXPOSURE_ENTRIES);
    storage.setItem(FEED_EXPOSURE_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage may be unavailable or full.
  }
}

function upsertFeedExposureEntry(
  scope: FeedExposureScope,
  contentId: bigint | string,
  update: (entry: FeedExposureEntry, now: number) => FeedExposureEntry,
  now = Date.now(),
) {
  const entries = readFeedExposureEntries();
  const scopeKey = getScopeKey(scope);
  const normalizedContentId = normalizeContentId(contentId);
  const existingIndex = entries.findIndex(
    entry => entry.scopeKey === scopeKey && entry.contentId === normalizedContentId,
  );
  const existingEntry =
    existingIndex >= 0
      ? entries[existingIndex]
      : {
          scopeKey,
          contentId: normalizedContentId,
          firstSeenAt: now,
          lastSeenAt: now,
          seenCount: 0,
          ignoredCount: 0,
        };
  const nextEntry = update(existingEntry, now);

  if (existingIndex >= 0) {
    entries[existingIndex] = nextEntry;
  } else {
    entries.push(nextEntry);
  }

  writeFeedExposureEntries(entries);
}

export function recordFeedExposure(scope: FeedExposureScope, params: FeedExposureRecordParams) {
  upsertFeedExposureEntry(
    scope,
    params.contentId,
    (entry, now) => {
      const nextEntry: FeedExposureEntry = {
        ...entry,
        lastSeenAt: now,
        seenCount: entry.seenCount + 1,
      };

      if (params.hasPositiveInteraction) {
        nextEntry.lastPositiveAt = now;
      } else {
        nextEntry.ignoredCount = entry.ignoredCount + 1;
        nextEntry.lastIgnoredAt = now;
      }

      return nextEntry;
    },
    params.now,
  );
}

export function recordFeedPositiveInteraction(scope: FeedExposureScope, params: FeedPositiveInteractionParams) {
  upsertFeedExposureEntry(
    scope,
    params.contentId,
    (entry, now) => ({
      ...entry,
      lastPositiveAt: now,
      lastVotedAt: params.isVote ? now : entry.lastVotedAt,
    }),
    params.now,
  );
}

function isIgnoredEntryActive(entry: FeedExposureEntry, now: number) {
  const lastIgnoredAt = entry.lastIgnoredAt ?? 0;
  if (lastIgnoredAt <= 0) return false;

  const lastPositiveAt = Math.max(entry.lastPositiveAt ?? 0, entry.lastVotedAt ?? 0);
  if (lastPositiveAt >= lastIgnoredAt) return false;

  const ignoreTtl = Math.min(Math.max(entry.ignoredCount, 1) * BASE_IGNORE_TTL_MS, MAX_IGNORE_TTL_MS);
  return now - lastIgnoredAt < ignoreTtl;
}

function getIgnoredContentIds(scope: FeedExposureScope, now: number): Set<string> {
  const scopeKey = getScopeKey(scope);
  return new Set(
    readFeedExposureEntries()
      .filter(entry => entry.scopeKey === scopeKey && isIgnoredEntryActive(entry, now))
      .map(entry => entry.contentId),
  );
}

export function applyFeedExposurePolicy<TItem extends { id: bigint | string }>(
  items: readonly TItem[],
  options: ApplyFeedExposurePolicyOptions,
): TItem[] {
  if (options.enabled === false || items.length === 0) {
    return [...items];
  }

  const now = options.now ?? Date.now();
  const minVisibleItems = Math.max(0, Math.floor(options.minVisibleItems ?? DEFAULT_MIN_VISIBLE_ITEMS));
  const protectedIds = new Set((options.protectedContentIds ?? []).map(normalizeContentId));
  const ignoredIds = getIgnoredContentIds(options.scope, now);
  const primaryItems: TItem[] = [];
  const ignoredItems: TItem[] = [];

  for (const item of items) {
    const contentId = normalizeContentId(item.id);
    if (!protectedIds.has(contentId) && ignoredIds.has(contentId)) {
      ignoredItems.push(item);
      continue;
    }

    primaryItems.push(item);
  }

  if (primaryItems.length >= minVisibleItems) {
    return [...primaryItems, ...ignoredItems];
  }

  const fallbackCount = minVisibleItems - primaryItems.length;
  return [...primaryItems, ...ignoredItems.slice(0, fallbackCount), ...ignoredItems.slice(fallbackCount)];
}
