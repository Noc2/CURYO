"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { useOnboarding } from "~~/hooks/useOnboarding";

/**
 * Dismissible banner explaining the 5-step voting flow for new users.
 */
export function VotingGuide() {
  const { shouldShowGuide, dismissGuide } = useOnboarding();

  if (!shouldShowGuide) return null;

  return (
    <div className="relative surface-card rounded-2xl p-4 mb-5 border border-primary/20 bg-primary/5">
      <button
        onClick={dismissGuide}
        className="absolute top-3 right-3 btn btn-ghost btn-xs btn-circle"
        aria-label="Dismiss guide"
      >
        <XMarkIcon className="w-4 h-4" />
      </button>

      <h3 className="font-semibold text-base mb-2">Welcome to Curyo voting!</h3>
      <p className="text-sm text-base-content/60 mb-3">Here&apos;s how the reputation game works:</p>

      <ol className="list-decimal list-inside space-y-1 text-sm text-base-content/70">
        <li>
          <strong>Browse</strong> — explore submitted content in the feed
        </li>
        <li>
          <strong>Vote</strong> — predict whether the content rating will go up or down
        </li>
        <li>
          <strong>Stake</strong> — back your prediction with cREP tokens
        </li>
        <li>
          <strong>Settle</strong> — rounds resolve automatically after the voting period
        </li>
        <li>
          <strong>Claim</strong> — collect your rewards if your prediction was correct
        </li>
      </ol>
    </div>
  );
}
