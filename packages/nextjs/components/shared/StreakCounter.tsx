"use client";

import { useAccount } from "wagmi";
import { useVoterStreak } from "~~/hooks/useVoterStreak";

function getStreakColor(streak: number): string {
  if (streak >= 90) return "text-purple-400";
  if (streak >= 30) return "text-red-400";
  if (streak >= 7) return "text-orange-400";
  return "text-base-content/80";
}

/**
 * Displays the user's daily voting streak with a flame icon.
 * Color-coded by milestone tier. Pulsing when within 2 days of a milestone.
 */
export function StreakCounter() {
  const { address } = useAccount();
  const streak = useVoterStreak(address);

  if (!streak || streak.currentDailyStreak === 0) return null;

  const color = getStreakColor(streak.currentDailyStreak);
  const nearMilestone = streak.nextMilestone !== null && streak.nextMilestone - streak.currentDailyStreak <= 2;

  const tooltipText = streak.nextMilestone
    ? `${streak.currentDailyStreak} day streak! Next milestone: ${streak.nextMilestone} days`
    : `${streak.currentDailyStreak} day streak! All milestones reached`;

  return (
    <div className="tooltip tooltip-bottom" data-tip={tooltipText}>
      <div
        className={`flex items-center gap-1.5 rounded-full bg-base-200 px-3 py-1.5 text-base font-medium tabular-nums ${color} ${
          nearMilestone ? "animate-pulse" : ""
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#EF476F" className="w-5 h-5 shrink-0">
          <path
            fillRule="evenodd"
            d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z"
            clipRule="evenodd"
          />
        </svg>
        <span>{streak.currentDailyStreak}</span>
      </div>
    </div>
  );
}
