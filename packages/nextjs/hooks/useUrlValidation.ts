"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface ValidationResult {
  isValid: boolean;
  checkedAt: string;
}

type ValidationMap = Map<string, boolean>;

const EMPTY_MAP: ValidationMap = new Map();

/**
 * Hook that checks URL validity for a list of content URLs.
 *
 * Flow:
 * 1. GET /api/url-validation — fetch cached results from DB
 * 2. POST /api/url-validation — validate any unchecked URLs (triggered once)
 * 3. Returns a Map<url, boolean> where false = broken URL
 *
 * URLs not yet checked are absent from the map (treated as valid until proven otherwise).
 */
export function useUrlValidation(urls: string[]) {
  // Deduplicate and stabilize the URL list
  const uniqueUrls = useMemo(() => [...new Set(urls)], [urls]);
  const urlsKey = useMemo(() => uniqueUrls.slice().sort().join(","), [uniqueUrls]);

  // Track whether we've already triggered validation for unchecked URLs
  const [hasTriggeredValidation, setHasTriggeredValidation] = useState(false);
  const prevUrlsKeyRef = useRef(urlsKey);

  // Reset validation trigger when URL list changes
  useEffect(() => {
    if (prevUrlsKeyRef.current !== urlsKey) {
      setHasTriggeredValidation(false);
      prevUrlsKeyRef.current = urlsKey;
    }
  }, [urlsKey]);

  // Step 1: Fetch cached validation results
  const {
    data: cachedResults,
    isLoading: isCacheLoading,
    refetch: refetchCache,
  } = useQuery({
    queryKey: ["urlValidation", "cache", urlsKey],
    queryFn: async (): Promise<Record<string, ValidationResult | null>> => {
      if (uniqueUrls.length === 0) return {};

      // Split into batches of 50 (URL param length limit)
      const BATCH_SIZE = 50;
      const allResults: Record<string, ValidationResult | null> = {};

      for (let i = 0; i < uniqueUrls.length; i += BATCH_SIZE) {
        const batch = uniqueUrls.slice(i, i + BATCH_SIZE);
        const params = batch.map(encodeURIComponent).join(",");
        const res = await fetch(`/api/url-validation?urls=${params}`);
        if (res.ok) {
          const data = (await res.json()) as { results: Record<string, ValidationResult | null> };
          Object.assign(allResults, data.results);
        }
      }

      return allResults;
    },
    enabled: uniqueUrls.length > 0,
    staleTime: 60_000,
  });

  // Find URLs that need validation (null = not in DB)
  const uncheckedUrls = useMemo(() => {
    if (!cachedResults) return [];
    return uniqueUrls.filter(url => cachedResults[url] === null || cachedResults[url] === undefined);
  }, [uniqueUrls, cachedResults]);

  // Step 2: Trigger validation for unchecked URLs (POST)
  const triggerValidation = useCallback(async () => {
    if (uncheckedUrls.length === 0) return;

    const BATCH_SIZE = 50;
    for (let i = 0; i < uncheckedUrls.length; i += BATCH_SIZE) {
      const batch = uncheckedUrls.slice(i, i + BATCH_SIZE);
      await fetch("/api/url-validation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: batch }),
      });
    }

    // Refetch cached results after validation completes
    await refetchCache();
  }, [uncheckedUrls, refetchCache]);

  // Auto-trigger validation once when unchecked URLs are discovered
  useEffect(() => {
    if (uncheckedUrls.length > 0 && !hasTriggeredValidation && !isCacheLoading) {
      setHasTriggeredValidation(true);
      triggerValidation();
    }
  }, [uncheckedUrls.length, hasTriggeredValidation, isCacheLoading, triggerValidation]);

  // Build the validation map
  const validationMap = useMemo((): ValidationMap => {
    if (!cachedResults) return EMPTY_MAP;

    const map = new Map<string, boolean>();
    for (const [url, result] of Object.entries(cachedResults)) {
      if (result !== null && result !== undefined) {
        map.set(url, result.isValid);
      }
    }
    return map;
  }, [cachedResults]);

  return {
    validationMap,
    isLoading: isCacheLoading,
    uncheckedCount: uncheckedUrls.length,
  };
}
