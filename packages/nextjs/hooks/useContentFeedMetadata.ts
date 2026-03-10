"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ContentItem } from "~~/hooks/contentFeed/shared";

export function useContentFeedMetadata(feed: ContentItem[]) {
  const feedUrls = useMemo(() => [...new Set(feed.map(item => item.url))], [feed]);
  const feedUrlsKey = useMemo(() => feedUrls.join(","), [feedUrls]);

  const { data: metadataResult } = useQuery({
    queryKey: ["contentFeedMetadata", feedUrlsKey],
    enabled: feedUrls.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const thumbnailMap: Record<string, string | null> = {};
      const validationMap: Record<string, boolean | null> = {};

      const thumbnailBatchSize = 40;
      for (let i = 0; i < feedUrls.length; i += thumbnailBatchSize) {
        const batch = feedUrls.slice(i, i + thumbnailBatchSize);
        try {
          const response = await fetch("/api/thumbnails", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: batch }),
          });
          if (!response.ok) continue;
          const data = (await response.json()) as {
            items?: Record<string, { thumbnailUrl?: string | null; imageUrl?: string | null }>;
          };
          for (const [url, item] of Object.entries(data.items ?? {})) {
            thumbnailMap[url] = item.thumbnailUrl ?? item.imageUrl ?? null;
          }
        } catch {
          // Metadata is optional; keep rendering even when enrichment fails.
        }
      }

      const validationBatchSize = 10;
      for (let i = 0; i < feedUrls.length; i += validationBatchSize) {
        const batch = feedUrls.slice(i, i + validationBatchSize);
        try {
          const response = await fetch("/api/url-validation", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ urls: batch }),
          });
          if (!response.ok) continue;
          const data = (await response.json()) as { results?: Record<string, { isValid: boolean }> };
          for (const [url, result] of Object.entries(data.results ?? {})) {
            validationMap[url] = result.isValid;
          }
        } catch {
          // Treat failures as unknown validity and keep rendering.
        }
      }

      return { thumbnailMap, validationMap };
    },
  });

  return {
    thumbnailMap: metadataResult?.thumbnailMap ?? {},
    validationMap: metadataResult?.validationMap ?? {},
  };
}
