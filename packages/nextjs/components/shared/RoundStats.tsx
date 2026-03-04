"use client";

import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import { useRoundInfo } from "~~/hooks/useRoundInfo";
import { useRoundPhase } from "~~/hooks/useRoundPhase";

function formatSettlementCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

interface RoundStatsProps {
  contentId: bigint;
  categoryId?: bigint;
}

/**
 * Displays stake and vote statistics for the current round on a specific content.
 *
 * tlock commit-reveal model:
 * - During epoch 1: votes are hidden (commit phase). Only totalStake and voteCount are shown.
 * - After epoch 1: keeper reveals votes. Revealed UP/DOWN pool breakdown is shown.
 */
export function RoundStats({ contentId, categoryId }: RoundStatsProps) {
  const contentLabel = useContentLabel(categoryId);
  const { round, isLoading, minVoters, maxVoters, isRoundFull, readyToSettle } = useRoundInfo(contentId);
  const { phase, isEpoch1, settlementCountdown, thresholdReachedAt } = useRoundPhase(contentId);

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
                      ? "Votes are hidden until epoch 1 ends. The keeper reveals them automatically after the epoch."
                      : "The keeper is revealing votes. Revealed votes are counted toward settlement."
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

      {/* Settlement status */}
      {phase === "voting" && (
        <div className="flex items-center gap-2">
          {isRoundFull ? (
            <span className="flex items-center gap-1 text-warning/80">
              Round full ({voteCount} / {maxVoters} voters)
              <InfoTooltip
                text="This round has reached the maximum voter limit. New votes cannot be added until a new round starts."
                position="bottom"
              />
            </span>
          ) : readyToSettle ? (
            <span className="flex items-center gap-1 text-success/80">
              {thresholdReachedAt > 0 && settlementCountdown > 0 ? (
                <>
                  Settles in{" "}
                  <span className="font-semibold tabular-nums">{formatSettlementCountdown(settlementCountdown)}</span>
                  <InfoTooltip
                    text="Votes revealed. The keeper will settle automatically after the settlement delay."
                    position="bottom"
                  />
                </>
              ) : thresholdReachedAt > 0 ? (
                <>
                  Ready to settle
                  <InfoTooltip
                    text="Settlement delay elapsed. The keeper will settle this round shortly."
                    position="bottom"
                  />
                </>
              ) : (
                <>
                  Awaiting reveals
                  <InfoTooltip
                    text={`At least ${minVoters} votes committed. The keeper reveals votes after each epoch ends, then settles after a one-epoch delay.`}
                    position="bottom"
                  />
                </>
              )}
            </span>
          ) : null}
        </div>
      )}

      {phase === "settled" && (
        <div className="flex items-center gap-1 text-success/80">
          <span>Rewards distributed</span>
          <InfoTooltip
            text="Rewards are proportional to epoch-weighted stake. Epoch-1 voters earn 4× more per cREP than epoch-2+ voters."
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
