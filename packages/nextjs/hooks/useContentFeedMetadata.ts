"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ContentItem } from "~~/hooks/contentFeed/shared";
import type { ContentMetadataResult } from "~~/lib/contentMetadata/types";

const THUMBNAIL_BATCH_SIZE = 40;

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

function mergeBatchMaps<T>(batches: Record<string, T>[]): Record<string, T> {
  return Object.assign({}, ...batches);
}

function getContentFeedUrls(feed: ContentItem[]): string[] {
  return [
    ...new Set(
      feed
        .flatMap(item => [item.url, ...item.media.map(mediaItem => mediaItem.url)])
        .filter((url): url is string => Boolean(url)),
    ),
  ].sort();
}

function shouldFetchMetadataUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function getContentFeedMetadataUrls(feed: ContentItem[]): string[] {
  return getContentFeedUrls(feed).filter(shouldFetchMetadataUrl);
}

export function getContentFeedMetadataCacheKey(urls: string[]): string {
  return JSON.stringify(urls);
}

export function getGenericValidationMap(urls: string[]): Record<string, boolean | null> {
  void urls;
  return {};
}

export function isContentFeedMetadataPrefetchPending(
  urls: string[],
  metadataMap: Record<string, ContentMetadataResult> | undefined,
): boolean {
  return urls.length > 0 && urls.some(url => !(url in (metadataMap ?? {})));
}

export function useContentFeedMetadata(feed: ContentItem[]) {
  const feedUrls = useMemo(() => getContentFeedUrls(feed), [feed]);
  const metadataUrls = useMemo(() => feedUrls.filter(shouldFetchMetadataUrl), [feedUrls]);
  const metadataUrlsKey = useMemo(() => getContentFeedMetadataCacheKey(metadataUrls), [metadataUrls]);
  const genericValidationMap = useMemo(() => getGenericValidationMap(feedUrls), [feedUrls]);

  const { data: metadataMap } = useQuery({
    queryKey: ["contentFeedMetadata", metadataUrlsKey],
    enabled: metadataUrls.length > 0,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const metadataBatches = await Promise.all(
        chunkItems(metadataUrls, THUMBNAIL_BATCH_SIZE).map(fetchThumbnailMetadataBatch),
      );
      return mergeBatchMaps(metadataBatches);
    },
  });

  return {
    metadataMap: metadataMap ?? {},
    validationMap: genericValidationMap,
    isMetadataPrefetchPending: isContentFeedMetadataPrefetchPending(metadataUrls, metadataMap),
  };
}
