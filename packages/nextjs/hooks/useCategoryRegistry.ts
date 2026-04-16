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
  slug: string;
  subcategories: readonly string[];
  createdAt: bigint;
}

/**
 * Hook to fetch seeded discovery categories.
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
          subcategories: readonly string[];
          createdAt: bigint;
        };
        return {
          id: cat.id,
          name: cat.name,
          slug: cat.domain,
          subcategories: cat.subcategories,
          createdAt: cat.createdAt,
        } as Category;
      })
      .filter((cat): cat is Category => cat !== null);
  }, [categoriesData]);

  // --- Ponder-first with RPC fallback ---
  const { data: result, isLoading: ponderLoading } = usePonderQuery({
    queryKey: ["categories"],
    ponderFn: async () => {
      const response = await ponderApi.getCategories();
      // Ponder doesn't have subcategories; RPC enrichment below fills them when available.
      return response.items.map(
        (cat): Category => ({
          id: BigInt(cat.id),
          name: cat.name,
          slug: cat.domain,
          subcategories: [],
          createdAt: BigInt(cat.createdAt),
        }),
      );
    },
    rpcFn: async () => rpcCategories,
    staleTime: 300_000,
    refetchInterval: 300_000,
  });

  // Merge Ponder categories with RPC data to fill in subcategories.
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
      };
    });

    // Append RPC categories that Ponder is missing
    const rpcOnly = rpcCategories.filter(cat => !ponderIds.has(cat.id.toString()));
    if (rpcOnly.length > 0) {
      return [...merged, ...rpcOnly];
    }

    return merged;
  }, [result?.data, rpcCategories]);

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
    categoryNameToId,
    isLoading: ponderLoading && (metaLoading || idsPageLoading || categoriesLoading),
    refetch: async () => {
      await refetchMeta();
      await refetchIds();
    },
  };
}

/** Category slugs to human-friendly content type labels. */
const CATEGORY_CONTENT_LABELS: Record<string, string> = {
  products: "product",
  "local-places": "place",
  travel: "travel item",
  apps: "app",
  media: "media item",
  design: "design",
  "ai-answers": "AI answer",
  "developer-docs": "document",
  trust: "trust item",
  general: "content",
};

/**
 * Get a human-friendly content type label for a category (e.g. "product", "app", "media item").
 * Falls back to "content" for unknown categories.
 */
function getContentLabel(categoryId: bigint | undefined, categories: Category[]): string {
  if (!categoryId) return "content";
  const category = categories.find(c => c.id === categoryId);
  if (!category) return "content";
  return CATEGORY_CONTENT_LABELS[category.slug] ?? "content";
}

/**
 * Hook to get a human-friendly content type label for a category ID.
 */
export function useContentLabel(categoryId?: bigint): string {
  const { categories } = useCategoryRegistry();
  return getContentLabel(categoryId, categories);
}
