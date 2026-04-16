"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ContentItem } from "~~/hooks/contentFeed/shared";
import { isDirectImageUrl } from "~~/lib/contentMedia";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import { detectPlatform } from "~~/utils/platforms";

const THUMBNAIL_BATCH_SIZE = 40;
const VALIDATION_BATCH_SIZE = 10;
const VALIDATION_CACHE_MS = 24 * 60 * 60 * 1000;

const validationResultCache = new Map<string, { value: boolean | null; expiresAt: number }>();

function chunkItems<T>(items: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

async function fetchThumbnailMetadataBatch(batch: string[]): Promise<Record<string, ContentMetadataResult>> {
  try {
    const response = await fetch("/api/thumbnails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: batch }),
    });
    if (!response.ok) return {};

    const data = (await response.json()) as { items?: Record<string, ContentMetadataResult> };
    return data.items ?? {};
  } catch {
    // Metadata is optional; keep rendering even when enrichment fails.
    return {};
  }
}

export function normalizeValidationBatchResults(
  batch: string[],
  results: Record<string, { isValid: boolean }> | undefined,
): Record<string, boolean> {
  const normalized = Object.fromEntries(
    Object.entries(results ?? {}).map(([url, result]) => [url, result.isValid] satisfies [string, boolean]),
  );

  for (const url of batch) {
    if (!(url in normalized) && detectPlatform(url).type === "generic" && !isDirectImageUrl(url)) {
      normalized[url] = false;
    }
  }

  return normalized;
}

async function fetchValidationBatch(batch: string[]): Promise<Record<string, boolean | null>> {
  try {
    const response = await fetch("/api/url-validation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: batch }),
    });
    if (!response.ok) return {};

    const data = (await response.json()) as { results?: Record<string, { isValid: boolean }> };
    return normalizeValidationBatchResults(batch, data.results);
  } catch {
    // Treat failures as unknown validity and keep rendering.
    return {};
  }
}

function mergeBatchMaps<T>(batches: Record<string, T>[]): Record<string, T> {
  return Object.assign({}, ...batches);
}

export function getContentFeedMetadataUrls(feed: ContentItem[]): string[] {
  return [
    ...new Set(
      feed
        .flatMap(item => [item.url, ...item.media.map(mediaItem => mediaItem.url)])
        .filter((url): url is string => Boolean(url)),
    ),
  ].sort();
}

export function getContentFeedMetadataCacheKey(urls: string[]): string {
  return JSON.stringify(urls);
}

export function getContentFeedValidationUrls(urls: string[]): string[] {
  return urls.filter(url => detectPlatform(url).type !== "generic" && !isDirectImageUrl(url));
}

export function getGenericValidationMap(urls: string[]): Record<string, boolean | null> {
  return Object.fromEntries(
    urls.filter(url => detectPlatform(url).type === "generic" && !isDirectImageUrl(url)).map(url => [url, false]),
  );
}

function getCachedValidationMap(urls: string[], now = Date.now()): Record<string, boolean | null> {
  const cached: Record<string, boolean | null> = {};

  for (const url of urls) {
    const result = validationResultCache.get(url);
    if (!result) continue;
    if (result.expiresAt <= now) {
      validationResultCache.delete(url);
      continue;
    }
    cached[url] = result.value;
  }

  return cached;
}

function getUncachedValidationUrls(urls: string[], now = Date.now()): string[] {
  getCachedValidationMap(urls, now);
  return urls.filter(url => !validationResultCache.has(url));
}

function rememberValidationResults(results: Record<string, boolean | null>, now = Date.now()) {
  const expiresAt = now + VALIDATION_CACHE_MS;
  for (const [url, value] of Object.entries(results)) {
    validationResultCache.set(url, { value, expiresAt });
  }
}

export function isContentFeedMetadataPrefetchPending(
  urls: string[],
  metadataMap: Record<string, ContentMetadataResult> | undefined,
): boolean {
  return urls.length > 0 && urls.some(url => !(url in (metadataMap ?? {})));
}

export function useContentFeedMetadata(feed: ContentItem[]) {
  const feedUrls = useMemo(() => getContentFeedMetadataUrls(feed), [feed]);
  const feedUrlsKey = useMemo(() => getContentFeedMetadataCacheKey(feedUrls), [feedUrls]);
  const validationUrls = useMemo(() => getContentFeedValidationUrls(feedUrls), [feedUrls]);
  const validationUrlsKey = useMemo(() => getContentFeedMetadataCacheKey(validationUrls), [validationUrls]);
  const genericValidationMap = useMemo(() => getGenericValidationMap(feedUrls), [feedUrls]);

  const { data: metadataMap } = useQuery({
    queryKey: ["contentFeedMetadata", feedUrlsKey],
    enabled: feedUrls.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const metadataBatches = await Promise.all(
        chunkItems(feedUrls, THUMBNAIL_BATCH_SIZE).map(fetchThumbnailMetadataBatch),
      );
      return mergeBatchMaps(metadataBatches);
    },
  });

  const { data: validationMap } = useQuery({
    queryKey: ["contentFeedValidation", validationUrlsKey],
    enabled: validationUrls.length > 0,
    staleTime: VALIDATION_CACHE_MS,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const urlsToValidate = getUncachedValidationUrls(validationUrls);
      const validationBatches = await Promise.all(
        chunkItems(urlsToValidate, VALIDATION_BATCH_SIZE).map(fetchValidationBatch),
      );
      const fetchedMap = mergeBatchMaps(validationBatches);
      rememberValidationResults(fetchedMap);
      return { ...getCachedValidationMap(validationUrls), ...fetchedMap };
    },
  });

  const mergedValidationMap = useMemo(
    () => ({
      ...genericValidationMap,
      ...getCachedValidationMap(validationUrls),
      ...(validationMap ?? {}),
    }),
    [genericValidationMap, validationMap, validationUrls],
  );

  return {
    metadataMap: metadataMap ?? {},
    validationMap: mergedValidationMap,
    isMetadataPrefetchPending: isContentFeedMetadataPrefetchPending(feedUrls, metadataMap),
  };
}
