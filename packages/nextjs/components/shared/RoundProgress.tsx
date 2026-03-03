"use client";

import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useRoundPhase } from "~~/hooks/useRoundPhase";

interface RoundProgressProps {
  contentId: bigint;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDays(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  return formatDuration(seconds);
}

/**
 * Displays compact round progress for a content item.
 *
 * Active round shows the epoch tier badge:
 * - Tier 1 (epoch 1): Full reward weight (100%) — blind voting, direction hidden
 * - Tier 2 (epoch 2+): Reduced reward weight (25%) — epoch 1 results now visible
 *
 * Terminal states: Resolved / Cancelled / Tied
 */
export function RoundProgress({ contentId }: RoundProgressProps) {
  const { phase, roundTimeRemaining, isEpoch1, epoch1Remaining, isReady } = useRoundPhase(contentId);

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
          Resolved
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

  // Active round (phase === "voting")
  const formattedExpiry = roundTimeRemaining > 0 ? formatDays(roundTimeRemaining) : null;

  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-base text-base-content/60">
      {/* Epoch tier badge */}
      {isEpoch1 ? (
        <div className="flex items-center gap-1.5">
          <span className="badge badge-success badge-sm gap-1 text-base">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            Tier 1 — full weight
          </span>
          <InfoTooltip
            text="Epoch 1: votes are hidden (tlock). You earn 100% reward weight. Tier drops to 25% when epoch ends."
            position="bottom"
          />
          {epoch1Remaining > 0 && (
            <span className="text-success/80 tabular-nums text-base">{formatDuration(epoch1Remaining)} left</span>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <span className="badge badge-warning badge-sm gap-1 text-base">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
              <path
                fillRule="evenodd"
                d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                clipRule="evenodd"
              />
            </svg>
            Tier 2 — 25% weight
          </span>
          <InfoTooltip
            text="Epoch 2+: epoch 1 results are now visible. Late voters earn 25% reward weight (4× less than epoch 1)."
            position="bottom"
          />
        </div>
      )}

      {/* Round expiry */}
      {formattedExpiry && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Expires in
            <InfoTooltip
              text="Maximum time until the round expires. Settlement happens sooner once enough votes are revealed."
              position="bottom"
            />
          </span>
          <span className="font-semibold tabular-nums">{formattedExpiry}</span>
        </div>
      )}
    </div>
  );
}
