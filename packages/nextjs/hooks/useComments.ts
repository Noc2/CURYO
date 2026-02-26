"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useSignMessage } from "wagmi";

export interface CommentData {
  id: number;
  contentId: string;
  walletAddress: string;
  body: string;
  createdAt: string;
  username: string | null;
  profileImageUrl: string | null;
}

export function useComments(contentId: bigint | null) {
  const contentIdStr = contentId?.toString() ?? "";
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["comments", contentIdStr],
    queryFn: async () => {
      const res = await fetch(`/api/comments?contentId=${contentIdStr}`);
      if (!res.ok) throw new Error("Failed to fetch comments");
      return res.json() as Promise<{ comments: CommentData[]; count: number }>;
    },
    enabled: !!contentIdStr,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const submitComment = useCallback(
    async (body: string) => {
      if (!address || !contentIdStr || !body.trim()) return false;

      setIsSubmitting(true);
      setSubmitError(null);

      try {
        const trimmed = body.trim();
        const message = `Post comment on Curyo content #${contentIdStr}:\n${trimmed}`;
        const signature = await signMessageAsync({ message });

        // Optimistic update
        const optimisticComment: CommentData = {
          id: Date.now(),
          contentId: contentIdStr,
          walletAddress: address.toLowerCase(),
          body: trimmed,
          createdAt: new Date().toISOString(),
          username: null,
          profileImageUrl: null,
        };

        queryClient.setQueryData(
          ["comments", contentIdStr],
          (old: { comments: CommentData[]; count: number } | undefined) => ({
            comments: [...(old?.comments ?? []), optimisticComment],
            count: (old?.count ?? 0) + 1,
          }),
        );

        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentId: contentIdStr, body: trimmed, address, signature }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to post comment");
        }

        // Refetch to get real data (proper ID, profile info)
        await refetch();
        return true;
      } catch (err) {
        // Rollback optimistic update
        await refetch();
        const errMsg = (err as Error).message?.includes("rejected")
          ? "Signature rejected"
          : (err as Error).message || "Failed to post comment";
        setSubmitError(errMsg);
        return false;
      } finally {
        setIsSubmitting(false);
      }
    },
    [address, contentIdStr, signMessageAsync, queryClient, refetch],
  );

  return {
    comments: data?.comments ?? [],
    count: data?.count ?? 0,
    isLoading,
    submitComment,
    isSubmitting,
    submitError,
  };
}
