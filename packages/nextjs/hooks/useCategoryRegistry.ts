"use client";

import { useMemo } from "react";
import { CategoryRegistryAbi } from "@curyo/contracts/abis";
import { useReadContract, useReadContracts } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { ponderApi } from "~~/services/ponder/client";

export interface Category {
  id: bigint;
  name: string;
  domain: string;
  subcategories: string[];
  rankingQuestion: string;
  submitter: string;
  stakeAmount: bigint;
  status: number; // 0 = Pending, 1 = Approved, 2 = Rejected, 3 = Canceled
  proposalId: bigint;
  createdAt: bigint;
}

/**
 * Hook to fetch approved categories.
 * Uses Ponder API when available, falls back to on-chain multicall.
 */
export function useCategoryRegistry() {
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "CategoryRegistry" });

  const {
    data: approvedIdsMeta,
    isLoading: metaLoading,
    refetch: refetchMeta,
  } = useReadContract({
    address: registryInfo?.address,
    abi: CategoryRegistryAbi,
    functionName: "getApprovedCategoryIdsPaginated",
    args: [0n, 0n],
    query: {
      enabled: Boolean(registryInfo?.address),
      refetchInterval: 300_000,
    },
  });

  const approvedCategoryTotal = (approvedIdsMeta?.[1] as bigint | undefined) ?? 0n;

  const {
    data: approvedIdsPage,
    isLoading: idsPageLoading,
    refetch: refetchIds,
  } = useReadContract({
    address: registryInfo?.address,
    abi: CategoryRegistryAbi,
    functionName: "getApprovedCategoryIdsPaginated",
    args: [0n, approvedCategoryTotal],
    query: {
      enabled: Boolean(registryInfo?.address) && approvedCategoryTotal > 0n,
      refetchInterval: 300_000,
    },
  });

  const approvedIds = useMemo(() => (approvedIdsPage?.[0] as bigint[] | undefined) ?? [], [approvedIdsPage]);

  const categoryCalls = useMemo(() => {
    if (!registryInfo || approvedIds.length === 0) return [];
    return approvedIds.map(id => ({
      address: registryInfo.address,
      abi: CategoryRegistryAbi,
      functionName: "getCategory" as const,
      args: [id],
    }));
  }, [registryInfo, approvedIds]);

  const { data: categoriesData, isLoading: categoriesLoading } = useReadContracts({
    contracts: categoryCalls,
    query: {
      enabled: categoryCalls.length > 0,
    },
  });

  const rpcCategories = useMemo((): Category[] => {
    if (!categoriesData) return [];
    return categoriesData
      .map(result => {
        if (result.status !== "success") return null;
        const cat = result.result as {
          id: bigint;
          name: string;
          domain: string;
          subcategories: string[];
          rankingQuestion: string;
          submitter: string;
          stakeAmount: bigint;
          status: number;
          proposalId: bigint;
          createdAt: bigint;
        };
        return {
          id: cat.id,
          name: cat.name,
          domain: cat.domain,
          subcategories: cat.subcategories,
          rankingQuestion: cat.rankingQuestion,
          submitter: cat.submitter,
          stakeAmount: cat.stakeAmount,
          status: cat.status,
          proposalId: cat.proposalId,
          createdAt: cat.createdAt,
        } as Category;
      })
      .filter((cat): cat is Category => cat !== null);
  }, [categoriesData]);

  // --- Ponder-first with RPC fallback ---
  const { data: result, isLoading: ponderLoading } = usePonderQuery({
    queryKey: ["categories"],
    ponderFn: async () => {
      const response = await ponderApi.getCategories("1");
      // Ponder doesn't have subcategories/rankingQuestion/stakeAmount — fill defaults.
      // These fields are only used on the submit page and can be fetched from RPC there.
      return response.items.map(
        (cat): Category => ({
          id: BigInt(cat.id),
          name: cat.name,
          domain: cat.domain,
          subcategories: [],
          rankingQuestion: "",
          submitter: cat.submitter,
          stakeAmount: 0n,
          status: cat.status,
          proposalId: cat.proposalId ? BigInt(cat.proposalId) : 0n,
          createdAt: BigInt(cat.createdAt),
        }),
      );
    },
    rpcFn: async () => rpcCategories,
    staleTime: 300_000,
    refetchInterval: 300_000,
  });

  // Merge Ponder categories with RPC data to fill in subcategories/rankingQuestion/stakeAmount.
  // Also include RPC-only categories that Ponder may have missed (e.g. due to incomplete indexing).
  const categories = useMemo(() => {
    const ponderCategories = result?.data;
    if (!ponderCategories) return rpcCategories;
    if (rpcCategories.length === 0) return ponderCategories;

    // Build lookups
    const rpcMap = new Map<string, Category>();
    rpcCategories.forEach(cat => rpcMap.set(cat.id.toString(), cat));

    const ponderIds = new Set(ponderCategories.map(cat => cat.id.toString()));

    // Enrich Ponder categories with RPC fields
    const merged = ponderCategories.map(cat => {
      const rpcCat = rpcMap.get(cat.id.toString());
      if (!rpcCat) return cat;
      return {
        ...cat,
        subcategories: rpcCat.subcategories,
        rankingQuestion: rpcCat.rankingQuestion,
        stakeAmount: rpcCat.stakeAmount,
      };
    });

    // Append RPC categories that Ponder is missing
    const rpcOnly = rpcCategories.filter(cat => !ponderIds.has(cat.id.toString()));
    if (rpcOnly.length > 0) {
      return [...merged, ...rpcOnly];
    }

    return merged;
  }, [result?.data, rpcCategories]);

  // Create domain lookup map for submit page
  const domainToCategoryId = useMemo(() => {
    const map = new Map<string, bigint>();
    categories.forEach(cat => {
      map.set(cat.domain.toLowerCase(), cat.id);
    });
    return map;
  }, [categories]);

  // Create name to ID lookup for filtering
  const categoryNameToId = useMemo(() => {
    const map = new Map<string, bigint>();
    categories.forEach(cat => {
      map.set(cat.name, cat.id);
    });
    return map;
  }, [categories]);

  return {
    categories,
    domainToCategoryId,
    categoryNameToId,
    isLoading: ponderLoading && (metaLoading || idsPageLoading || categoriesLoading),
    refetch: async () => {
      await refetchMeta();
      await refetchIds();
    },
  };
}

/**
 * Extract domain from a URL, normalized (lowercase, www stripped).
 */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    let hostname = parsed.hostname.toLowerCase();
    // Remove www. prefix
    if (hostname.startsWith("www.")) {
      hostname = hostname.slice(4);
    }
    return hostname;
  } catch {
    return null;
  }
}

// Domain aliases for common shortlinks and subdomains
const DOMAIN_ALIASES: Record<string, string> = {
  "youtu.be": "youtube.com",
  "m.youtube.com": "youtube.com",
  "m.twitch.tv": "twitch.tv",
  "clips.twitch.tv": "twitch.tv",
  "twitter.com": "x.com",
  "mobile.twitter.com": "x.com",
};

/**
 * Resolve a domain to its canonical form using known aliases.
 */
export function resolveCanonicalDomain(domain: string): string {
  return DOMAIN_ALIASES[domain] ?? domain;
}

/**
 * Find categoryId from a URL using the domain map.
 * Returns 0n for unknown/legacy content.
 */
export function getCategoryIdFromUrl(url: string, domainMap: Map<string, bigint>): bigint {
  const domain = extractDomain(url);
  if (!domain) return 0n;

  // Check direct match
  if (domainMap.has(domain)) {
    return domainMap.get(domain)!;
  }

  // Check for known aliases
  const aliasedDomain = DOMAIN_ALIASES[domain];
  if (aliasedDomain && domainMap.has(aliasedDomain)) {
    return domainMap.get(aliasedDomain)!;
  }

  // Fallback: try parent domains (e.g. clips.twitch.tv → twitch.tv)
  const parts = domain.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join(".");
    if (domainMap.has(parent)) {
      return domainMap.get(parent)!;
    }
  }

  return 0n; // Legacy/unknown category
}

/** Map platform domains to human-friendly content type labels. */
const DOMAIN_CONTENT_LABELS: Record<string, string> = {
  "youtube.com": "video",
  "twitch.tv": "video",
  "scryfall.com": "card",
  "en.wikipedia.org": "article",
  "rawg.io": "game",
  "openlibrary.org": "book",
  "huggingface.co": "ai",
  "www.themoviedb.org": "movie",
  "coingecko.com": "token",
  "open.spotify.com": "podcast",
  "x.com": "tweet",
};

/**
 * Get a human-friendly content type label for a category (e.g. "video", "card", "book").
 * Falls back to "content" for unknown categories.
 */
export function getContentLabel(categoryId: bigint | undefined, categories: Category[]): string {
  if (!categoryId) return "content";
  const category = categories.find(c => c.id === categoryId);
  if (!category) return "content";
  return DOMAIN_CONTENT_LABELS[category.domain] ?? "content";
}

/**
 * Hook to get a human-friendly content type label for a category ID.
 */
export function useContentLabel(categoryId?: bigint): string {
  const { categories } = useCategoryRegistry();
  return getContentLabel(categoryId, categories);
}
