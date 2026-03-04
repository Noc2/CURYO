"use client";

import { useAccount } from "wagmi";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useVoterStreak } from "~~/hooks/useVoterStreak";

function getStreakColor(streak: number): string {
  if (streak >= 90) return "text-purple-400";
  if (streak >= 30) return "text-red-400";
  if (streak >= 7) return "text-orange-400";
  return "text-base-content/40";
}

const STREAK_INITIAL_RATE_BPS = 9000;

/**
 * Displays the user's daily voting streak with a flame icon.
 * Color-coded by milestone tier. Pulsing when within 2 days of a milestone.
 */
export function StreakCounter() {
  const { address } = useAccount();
  const streak = useVoterStreak(address);
  const { rateBps } = useParticipationRate();

  if (!streak || streak.currentDailyStreak === 0) return null;

  const color = getStreakColor(streak.currentDailyStreak);
  const nearMilestone = streak.nextMilestone !== null && streak.nextMilestone - streak.currentDailyStreak <= 2;

  const adjustedBonus =
    streak.nextMilestoneBaseBonus && rateBps
      ? Math.floor((streak.nextMilestoneBaseBonus * rateBps) / STREAK_INITIAL_RATE_BPS)
      : streak.nextMilestoneBaseBonus;

  const tooltipText = streak.nextMilestone
    ? `${streak.currentDailyStreak} day streak! Next: ${streak.nextMilestone} days (~${adjustedBonus} cREP)`
    : `${streak.currentDailyStreak} day streak! All milestones reached`;

  return (
    <div className="tooltip tooltip-bottom" data-tip={tooltipText}>
      <div
        className={`flex items-center gap-1 text-sm font-semibold tabular-nums ${color} ${
          nearMilestone ? "animate-pulse" : ""
        }`}
      >
        <span className="text-base">&#x1F525;</span>
        <span>{streak.currentDailyStreak}</span>
      </div>
    </div>
  );
}
