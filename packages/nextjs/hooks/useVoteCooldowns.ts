"use client";

import { useMemo } from "react";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { getVoteCooldownRemainingSeconds } from "~~/lib/vote/cooldown";
import { type PonderVoteCooldownsResponse, ponderApi } from "~~/services/ponder/client";

interface UseVoteCooldownsParams {
  contentIds: readonly bigint[];
  voters: readonly string[];
  nowSeconds: number;
  enabled?: boolean;
}

function normalizeContentIds(contentIds: readonly bigint[]) {
  const unique = new Set<string>();
  for (const contentId of contentIds) {
    if (contentId < 0n) continue;
    unique.add(contentId.toString());
  }
  return Array.from(unique);
}

function normalizeVoters(voters: readonly string[]) {
  const unique = new Set<string>();
  for (const voter of voters) {
    const normalized = voter.trim().toLowerCase();
    if (!normalized) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

export function useVoteCooldowns({ contentIds, voters, nowSeconds, enabled = true }: UseVoteCooldownsParams) {
  const { targetNetwork } = useTargetNetwork();
  const isPageVisible = usePageVisibility();
  const normalizedContentIds = useMemo(() => normalizeContentIds(contentIds), [contentIds]);
  const normalizedVoters = useMemo(() => normalizeVoters(voters), [voters]);
  const contentIdsKey = normalizedContentIds.join(",");
  const votersKey = normalizedVoters.join(",");
  const queryEnabled = enabled && normalizedContentIds.length > 0 && normalizedVoters.length > 0;

  const { data: result, isLoading } = usePonderQuery<PonderVoteCooldownsResponse, PonderVoteCooldownsResponse>({
    queryKey: ["voteCooldowns", targetNetwork.id, contentIdsKey, votersKey],
    enabled: queryEnabled,
    ponderFn: () =>
      ponderApi.getVoteCooldowns({
        contentIds: contentIdsKey,
        voters: votersKey,
      }),
    rpcFn: async () => ({ items: [] }),
    rpcEnabled: true,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
  });

  const cooldownByContentId = useMemo(() => {
    const cooldowns = new Map<string, number>();

    for (const item of result?.data.items ?? []) {
      const remainingSeconds = getVoteCooldownRemainingSeconds(item.latestCommittedAt, nowSeconds);
      if (remainingSeconds <= 0) continue;

      const previous = cooldowns.get(item.contentId) ?? 0;
      if (remainingSeconds > previous) {
        cooldowns.set(item.contentId, remainingSeconds);
      }
    }

    return cooldowns;
  }, [nowSeconds, result?.data.items]);

  return {
    cooldownByContentId,
    isLoading,
  };
}
