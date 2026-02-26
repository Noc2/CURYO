"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * Lightweight hook that returns the comment count for a content item.
 * Shares the same React Query cache key as useComments for consistency.
 */
export function useCommentCount(contentId: bigint | null) {
  const contentIdStr = contentId?.toString() ?? "";

  const { data } = useQuery({
    queryKey: ["comments", contentIdStr],
    queryFn: async () => {
      const res = await fetch(`/api/comments?contentId=${contentIdStr}`);
      if (!res.ok) return { count: 0 };
      return res.json() as Promise<{ count: number }>;
    },
    enabled: !!contentIdStr,
    staleTime: 30_000,
    select: data => data.count,
  });

  return data ?? 0;
}
