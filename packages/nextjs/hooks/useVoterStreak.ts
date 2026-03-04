"use client";

import { useEffect, useState } from "react";
import { isPonderAvailable, ponderGet } from "~~/services/ponder/client";

interface StreakMilestone {
  days: number;
  baseBonus: number;
}

interface VoterStreakData {
  currentDailyStreak: number;
  bestDailyStreak: number;
  totalActiveDays: number;
  lastActiveDate: string | null;
  lastMilestoneDay: number;
  milestones: StreakMilestone[];
  nextMilestone: number | null;
  nextMilestoneBaseBonus: number | null;
}

/**
 * Fetches daily voting streak data from Ponder API.
 */
export function useVoterStreak(address?: string): VoterStreakData | null {
  const [data, setData] = useState<VoterStreakData | null>(null);

  useEffect(() => {
    if (!address) {
      setData(null);
      return;
    }

    let cancelled = false;

    async function fetchStreak() {
      const available = await isPonderAvailable();
      if (!available || cancelled) return;

      try {
        const result = await ponderGet<VoterStreakData>("/voter-streak", { voter: address });
        if (!cancelled) setData(result);
      } catch {
        // Ponder may not have the endpoint yet
      }
    }

    fetchStreak();
    const interval = setInterval(fetchStreak, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [address]);

  return data;
}
