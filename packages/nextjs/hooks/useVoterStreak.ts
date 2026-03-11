"use client";

import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { type PonderVoterStreak, ponderApi } from "~~/services/ponder/client";

const EMPTY_STREAK: PonderVoterStreak = {
  currentDailyStreak: 0,
  bestDailyStreak: 0,
  totalActiveDays: 0,
  lastActiveDate: null,
  lastMilestoneDay: 0,
  milestones: [],
  nextMilestone: null,
  nextMilestoneBaseBonus: null,
};

/**
 * Fetches daily voting streak data from Ponder API.
 */
export function useVoterStreak(address?: string): PonderVoterStreak | null {
  const isPageVisible = usePageVisibility();

  const { data } = usePonderQuery<PonderVoterStreak, PonderVoterStreak>({
    queryKey: ["voterStreak", address],
    ponderFn: async () => {
      if (!address) {
        return EMPTY_STREAK;
      }

      return ponderApi.getVoterStreak(address);
    },
    rpcFn: async () => EMPTY_STREAK,
    enabled: Boolean(address),
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
  });

  return data?.data ?? null;
}
