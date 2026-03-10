"use client";

import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import type { RoundSnapshot } from "~~/hooks/useRoundSnapshot";

interface RoundProgressProps {
  snapshot: RoundSnapshot;
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
 * Active round shows the phase badge:
 * - Blind phase: Full reward weight (100%) — votes encrypted, direction hidden
 * - Open phase: Reduced reward weight (25%) — blind phase results now visible
 *
 * Terminal states: Resolved / Cancelled / Tied / Reveal failed
 */
export function RoundProgress({ snapshot }: RoundProgressProps) {
  const {
    phase,
    roundTimeRemaining,
    isEpoch1,
    epoch1Remaining,
    isReady,
    thresholdReachedAt,
    currentEpochRemaining,
    voteCount,
    minVoters,
  } = snapshot;

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

  if (phase === "revealFailed") {
    return (
      <div className="flex items-center gap-2">
        <span className="badge badge-warning badge-sm gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.72-1.36 3.485 0l5.58 9.92c.75 1.334-.213 2.981-1.742 2.981H4.42c-1.53 0-2.492-1.647-1.742-2.98l5.58-9.92zM11 13a1 1 0 10-2 0 1 1 0 002 0zm-1-6a1 1 0 00-1 1v3a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Reveal failed — only revealed votes refund
        </span>
      </div>
    );
  }

  // Active round (phase === "voting")
  const formattedExpiry = roundTimeRemaining > 0 ? formatDays(roundTimeRemaining) : null;

  return (
    <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap text-base text-base-content/60">
      {/* Phase badge */}
      {isEpoch1 ? (
        <div className="flex items-center gap-1.5">
          <span className="badge badge-primary badge-sm gap-1 text-base">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            Blind Phase
          </span>
          <InfoTooltip
            text="Blind phase: votes are encrypted and hidden. You earn 100% reward weight. Weight drops to 25% when the blind phase ends."
            position="bottom"
          />
          {epoch1Remaining > 0 && (
            <span className="text-primary/80 tabular-nums text-base">{formatDuration(epoch1Remaining)} left</span>
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
            Open phase — 25% weight
          </span>
          <InfoTooltip
            text="Open phase: earlier votes are now visible. Late voters earn 25% reward weight (4× less than blind phase voters)."
            position="bottom"
          />
        </div>
      )}

      {/* Round expiry or resolution countdown */}
      {voteCount >= minVoters ? (
        <div className="flex items-center gap-2">
          {thresholdReachedAt > 0 ? (
            <>
              <span className="flex items-center gap-1">
                Ready to resolve
                <InfoTooltip
                  text="Enough votes are revealed. Settlement is available once past-epoch reveal checks are satisfied."
                  position="bottom"
                />
              </span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1">
                Resolves in
                <InfoTooltip
                  text="Estimated time: votes reveal when the blind phase ends. Settlement follows once enough votes are revealed and past-epoch reveal checks clear."
                  position="bottom"
                />
              </span>
              <span className="font-semibold tabular-nums">{formatDuration(currentEpochRemaining)}</span>
            </>
          )}
        </div>
      ) : (
        formattedExpiry && (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1">
              Expires in
              <InfoTooltip
                text="Maximum time until the round expires. Resolution happens sooner once enough votes are revealed."
                position="bottom"
              />
            </span>
            <span className="font-semibold tabular-nums">{formattedExpiry}</span>
          </div>
        )
      )}
    </div>
  );
}
