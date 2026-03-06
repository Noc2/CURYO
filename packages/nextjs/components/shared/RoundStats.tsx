"use client";

import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";

interface RoundStatsProps {
  contentId: bigint;
  categoryId?: bigint;
}

/**
 * Displays stake and vote statistics for the current round on a specific content.
 *
 * Blind voting model:
 * - During blind phase: votes are encrypted and hidden. Only totalStake and voteCount are shown.
 * - After blind phase: the system reveals votes. Revealed UP/DOWN pool breakdown is shown.
 */
export function RoundStats({ contentId, categoryId }: RoundStatsProps) {
  const contentLabel = useContentLabel(categoryId);
  const snapshot = useRoundSnapshot(contentId);
  const { round, isLoading, maxVoters, isRoundFull, phase, isEpoch1 } = snapshot;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2 text-base animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-4 w-20 bg-base-content/10 rounded" />
          <div className="w-px h-4 bg-base-content/10" />
          <div className="h-4 w-14 bg-base-content/10 rounded" />
        </div>
      </div>
    );
  }

  const totalStakeFormatted = Number(round.totalStake) / 1e6;
  const voteCount = Number(round.voteCount);
  const revealedCount = round.revealedCount;
  const pendingCount = Math.max(0, voteCount - revealedCount);

  // Pool breakdown (only available after votes are revealed)
  const upPoolFormatted = Number(round.upPool) / 1e6;
  const downPoolFormatted = Number(round.downPool) / 1e6;
  const upCount = Number(round.upCount);
  const downCount = Number(round.downCount);
  const hasRevealedVotes = revealedCount > 0;

  return (
    <div className="flex flex-col gap-1.5 text-base text-base-content/60">
      {/* Stats line */}
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Staked
            <InfoTooltip text="Total cREP committed in the current round." position="bottom" />
          </span>
          <span className="font-semibold tabular-nums">{totalStakeFormatted.toFixed(0)}</span>
        </div>
        <div className="w-px h-4 bg-base-content/10" />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Votes
            <InfoTooltip
              text={`Number of votes committed on this ${contentLabel} in the current round.`}
              position="bottom"
            />
          </span>
          <span className="font-semibold tabular-nums">{voteCount}</span>
        </div>
        {/* Pending reveal count */}
        {pendingCount > 0 && (
          <>
            <div className="w-px h-4 bg-base-content/10" />
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                Pending
                <InfoTooltip
                  text={
                    isEpoch1
                      ? "Votes are encrypted until the blind phase ends. They are revealed automatically afterward."
                      : "The system is revealing votes. Revealed votes are counted toward resolution."
                  }
                  position="bottom"
                />
              </span>
              <span className="font-semibold tabular-nums">{pendingCount}</span>
            </div>
          </>
        )}
      </div>

      {/* UP/DOWN pool breakdown (only after reveals) */}
      {hasRevealedVotes && (
        <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-success">
              UP
              <InfoTooltip text="Revealed UP votes and committed cREP." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums text-success">
              {upCount} ({upPoolFormatted.toFixed(0)} cREP)
            </span>
          </div>
          <div className="w-px h-4 bg-base-content/10" />
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-error">
              DOWN
              <InfoTooltip text="Revealed DOWN votes and committed cREP." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums text-error">
              {downCount} ({downPoolFormatted.toFixed(0)} cREP)
            </span>
          </div>
        </div>
      )}

      {/* Round full warning */}
      {phase === "voting" && isRoundFull && (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-warning/80">
            Round full ({voteCount} / {maxVoters} voters)
            <InfoTooltip
              text="This round has reached the maximum voter limit. New votes cannot be added until a new round starts."
              position="bottom"
            />
          </span>
        </div>
      )}

      {phase === "settled" && (
        <div className="flex items-center gap-1 text-success/80">
          <span>Rewards distributed</span>
          <InfoTooltip
            text="Rewards are proportional to phase-weighted stake. Blind phase voters earn 4× more per cREP than open phase voters."
            position="bottom"
          />
        </div>
      )}

      {phase === "cancelled" && (
        <div className="flex items-center gap-1 text-warning/80">
          <span>Round expired — full refund available</span>
          <InfoTooltip
            text="The round expired before enough votes were cast. All stakes are refunded."
            position="bottom"
          />
        </div>
      )}

      {phase === "tied" && (
        <div className="flex items-center gap-1 text-base-content/60">
          <span>Tied — all stakes returned</span>
          <InfoTooltip text="The round ended in a tie. All stakes are returned to voters." position="bottom" />
        </div>
      )}
    </div>
  );
}
