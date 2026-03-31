"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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

export function useContentFeedMetadata(feed: ContentItem[]) {
  const feedUrls = useMemo(() => getContentFeedMetadataUrls(feed), [feed]);
  const feedUrlsKey = useMemo(() => getContentFeedMetadataCacheKey(feedUrls), [feedUrls]);

  const { data: metadataResult } = useQuery({
    queryKey: ["contentFeedMetadata", feedUrlsKey],
    enabled: feedUrls.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // The batches are independent, so parallelizing them keeps hydration time from growing linearly with feed size.
      const [metadataBatches, validationBatches] = await Promise.all([
        Promise.all(chunkItems(feedUrls, THUMBNAIL_BATCH_SIZE).map(fetchThumbnailMetadataBatch)),
        Promise.all(chunkItems(feedUrls, VALIDATION_BATCH_SIZE).map(fetchValidationBatch)),
      ]);

      return {
        metadataMap: mergeBatchMaps(metadataBatches),
        validationMap: mergeBatchMaps(validationBatches),
      };
    },
  });

  return {
    metadataMap: metadataResult?.metadataMap ?? {},
    validationMap: metadataResult?.validationMap ?? {},
  };
}
