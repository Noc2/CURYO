"use client";

import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useRoundPhase } from "~~/hooks/useRoundPhase";

interface RoundProgressProps {
  contentId: bigint;
}

/**
 * Displays compact round progress for a content item.
 * - Open: round lifetime countdown
 * - Settled: "Settled" badge
 * - Cancelled: "Cancelled — full refund" badge
 * - Tied: "Tied — stakes returned" badge
 */
export function RoundProgress({ contentId }: RoundProgressProps) {
  const { phase, roundTimeRemaining, isReady } = useRoundPhase(contentId);

  // Round lifetime in days/hours
  const roundDays = Math.floor(roundTimeRemaining / 86400);
  const roundHours = Math.floor((roundTimeRemaining % 86400) / 3600);

  if (!isReady) {
    return (
      <div className="flex items-center gap-2 text-base text-base-content/40">
        <span className="loading loading-spinner loading-xs" />
        <span>Loading round...</span>
      </div>
    );
  }

  if (phase === "none") {
    return null;
  }

  if (phase === "settled") {
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-success badge-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
          Settled
        </span>
      </div>
    );
  }

  if (phase === "cancelled") {
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-warning badge-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
          Cancelled — full refund
        </span>
      </div>
    );
  }

  if (phase === "tied") {
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-neutral badge-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
          Tied — stakes returned
        </span>
      </div>
    );
  }

  const formattedExpiry =
    roundTimeRemaining > 0
      ? roundDays > 0
        ? `${roundDays}d ${roundHours}h`
        : `${roundHours}h ${Math.floor((roundTimeRemaining % 3600) / 60)}m`
      : null;

  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-base text-base-content/60">
      {formattedExpiry && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Expires
            <InfoTooltip
              text="If the round doesn't reach enough voters before expiry, it is cancelled and all stakes are refunded."
              position="bottom"
            />
          </span>
          <span className="font-semibold tabular-nums">{formattedExpiry}</span>
        </div>
      )}
    </div>
  );
}
