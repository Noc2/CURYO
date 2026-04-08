"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ContentItem } from "~~/hooks/contentFeed/shared";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";
import { detectPlatform } from "~~/utils/platforms";

const THUMBNAIL_BATCH_SIZE = 40;
const VALIDATION_BATCH_SIZE = 10;

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
    if (!(url in normalized) && detectPlatform(url).type === "generic") {
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
  return [...new Set(feed.map(item => item.url))].sort();
}

export function getContentFeedMetadataCacheKey(urls: string[]): string {
  return JSON.stringify(urls);
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
    queryKey: ["contentFeedValidation", feedUrlsKey],
    enabled: feedUrls.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const validationBatches = await Promise.all(
        chunkItems(feedUrls, VALIDATION_BATCH_SIZE).map(fetchValidationBatch),
      );
      return mergeBatchMaps(validationBatches);
    },
  });

  return {
    metadataMap: metadataMap ?? {},
    validationMap: validationMap ?? {},
    isMetadataPrefetchPending: isContentFeedMetadataPrefetchPending(feedUrls, metadataMap),
  };
}
