"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { ensurePrivateAccountReadSession } from "~~/hooks/usePrivateAccountSession";
import type { ContentFeedbackItem, ContentFeedbackListResult, ContentFeedbackType } from "~~/lib/feedback/types";
import { isSignatureRejected } from "~~/utils/signatureErrors";

interface SignedChallengeResponse {
  challengeId?: string;
  message?: string;
  chainId?: number;
  roundId?: string;
  clientNonce?: string;
  feedbackHash?: string;
  error?: string;
}

interface SubmitContentFeedbackInput {
  feedbackType: ContentFeedbackType;
  body: string;
  sourceUrl?: string;
}

interface ContentFeedbackActionResult {
  ok: boolean;
  reason?: "not_connected" | "rejected" | "request_failed";
  error?: string;
}

const EMPTY_FEEDBACK_RESPONSE: ContentFeedbackListResult = {
  items: [],
  count: 0,
  publicCount: 0,
  ownHiddenCount: 0,
  settlementComplete: false,
  openRoundId: null,
  hasReadSession: false,
};

function normalizeContentId(contentId: bigint | string | number | null | undefined): string | null {
  if (contentId === null || contentId === undefined) return null;
  const raw = typeof contentId === "bigint" ? contentId.toString() : String(contentId).trim();
  return /^\d+$/.test(raw) && raw !== "0" ? raw.replace(/^0+(?=\d)/, "") : null;
}

async function readResponseBody<T>(response: Response, fallbackError: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(body?.error || fallbackError);
  }

  return body as T;
}

export function useContentFeedback(contentId: bigint | string | number | null | undefined, address?: string) {
  const queryClient = useQueryClient();
  const { signMessageAsync } = useSignMessage();
  const normalizedContentId = useMemo(() => normalizeContentId(contentId), [contentId]);
  const normalizedAddress = address?.toLowerCase();
  const queryKey = useMemo(
    () => ["contentFeedback", normalizedContentId ?? "none", normalizedAddress ?? "anonymous"] as const,
    [normalizedAddress, normalizedContentId],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const feedbackQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!normalizedContentId) return EMPTY_FEEDBACK_RESPONSE;

      const params = new URLSearchParams({ contentId: normalizedContentId });
      if (address) {
        params.set("address", address);
      }

      return readResponseBody<ContentFeedbackListResult>(
        await fetch(`/api/feedback?${params.toString()}`),
        "Failed to fetch feedback",
      );
    },
    enabled: Boolean(normalizedContentId),
    staleTime: 15_000,
    refetchInterval: false,
    retry: false,
  });

  const submitFeedback = useCallback(
    async (input: SubmitContentFeedbackInput): Promise<ContentFeedbackActionResult> => {
      if (!address || !normalizedContentId) {
        return { ok: false, reason: "not_connected" };
      }

      setIsSubmitting(true);
      try {
        const challenge = await readResponseBody<SignedChallengeResponse>(
          await fetch("/api/feedback/challenge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              contentId: normalizedContentId,
              feedbackType: input.feedbackType,
              body: input.body,
              sourceUrl: input.sourceUrl,
            }),
          }),
          "Failed to create feedback challenge",
        );

        if (
          !challenge.message ||
          !challenge.challengeId ||
          !challenge.chainId ||
          !challenge.roundId ||
          !challenge.clientNonce ||
          !challenge.feedbackHash
        ) {
          throw new Error("Failed to create feedback challenge");
        }

        const signature = await signMessageAsync({ message: challenge.message });
        await readResponseBody<{ ok: true; item: ContentFeedbackItem }>(
          await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              address,
              contentId: normalizedContentId,
              feedbackType: input.feedbackType,
              body: input.body,
              sourceUrl: input.sourceUrl,
              chainId: challenge.chainId,
              roundId: challenge.roundId,
              clientNonce: challenge.clientNonce,
              feedbackHash: challenge.feedbackHash,
              signature,
              challengeId: challenge.challengeId,
            }),
          }),
          "Failed to submit feedback",
        );

        await queryClient.invalidateQueries({ queryKey });
        return { ok: true };
      } catch (error) {
        if (isSignatureRejected(error)) {
          return { ok: false, reason: "rejected" };
        }

        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to submit feedback",
        };
      } finally {
        setIsSubmitting(false);
      }
    },
    [address, normalizedContentId, queryClient, queryKey, signMessageAsync],
  );

  const requestReadAccess = useCallback(async (): Promise<ContentFeedbackActionResult> => {
    if (!address || !normalizedContentId) {
      return { ok: false, reason: "not_connected" };
    }

    setIsUnlocking(true);
    try {
      await ensurePrivateAccountReadSession(address, signMessageAsync);
      const params = new URLSearchParams({ contentId: normalizedContentId, address });
      const response = await readResponseBody<ContentFeedbackListResult>(
        await fetch(`/api/feedback?${params.toString()}`),
        "Failed to load feedback",
      );

      queryClient.setQueryData(queryKey, response);
      return { ok: true };
    } catch (error) {
      if (isSignatureRejected(error)) {
        return { ok: false, reason: "rejected" };
      }

      return {
        ok: false,
        reason: "request_failed",
        error: error instanceof Error ? error.message : "Failed to load feedback",
      };
    } finally {
      setIsUnlocking(false);
    }
  }, [address, normalizedContentId, queryClient, queryKey, signMessageAsync]);

  const feedback = feedbackQuery.data ?? EMPTY_FEEDBACK_RESPONSE;

  return {
    feedback,
    items: feedback.items,
    isLoading: feedbackQuery.isLoading,
    isFetching: feedbackQuery.isFetching,
    isSubmitting,
    isUnlocking,
    submitFeedback,
    requestReadAccess,
  };
}
