"use client";

import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import type { RoundSnapshot } from "~~/hooks/useRoundSnapshot";

interface RoundStatsProps {
  categoryId?: bigint;
  snapshot: RoundSnapshot;
}

/**
 * Displays stake and vote statistics for the current round on a specific content.
 *
 * Blind voting model:
 * - During blind phase: votes are encrypted and hidden. Only totalStake and voteCount are shown.
 * - After blind phase: the system reveals votes. Revealed UP/DOWN pool breakdown is shown.
 */
export function RoundStats({ categoryId, snapshot }: RoundStatsProps) {
  const contentLabel = useContentLabel(categoryId);
  const { round, isLoading, maxVoters, isRoundFull, phase, isEpoch1, minVoters, readyToSettle, thresholdReachedAt } =
    snapshot;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 py-2 text-base animate-pulse">
        <div className="flex items-center gap-3">
          <div className="h-4 w-20 rounded bg-base-content/10" />
          <div className="h-4 w-px bg-base-content/10" />
          <div className="h-4 w-14 rounded bg-base-content/10" />
        </div>
      </div>
    );
  }

  const totalStakeFormatted = Number(round.totalStake) / 1e6;
  const voteCount = Number(round.voteCount);
  const revealedCount = round.revealedCount;
  const pendingCount = Math.max(0, voteCount - revealedCount);
  const upPoolFormatted = Number(round.upPool) / 1e6;
  const downPoolFormatted = Number(round.downPool) / 1e6;
  const upCount = Number(round.upCount);
  const downCount = Number(round.downCount);
  const hasRevealedVotes = revealedCount > 0;
  const votersNeeded = Math.max(0, minVoters - voteCount);
  const revealsNeeded = Math.max(0, minVoters - revealedCount);
  const higherUpsideSide =
    !isEpoch1 && upPoolFormatted > 0 && downPoolFormatted > 0 && upPoolFormatted !== downPoolFormatted
      ? upPoolFormatted < downPoolFormatted
        ? "up"
        : "down"
      : null;

  return (
    <div className="flex flex-col gap-1.5 text-base text-base-content/60">
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Staked
            <InfoTooltip text="Total cREP committed in the current round." position="bottom" />
          </span>
          <span className="font-semibold tabular-nums">{totalStakeFormatted.toFixed(0)}</span>
        </div>
        <div className="h-4 w-px bg-base-content/10" />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Voters in
            <InfoTooltip
              text={`Number of votes committed on this ${contentLabel} in the current round.`}
              position="bottom"
            />
          </span>
          <span className="font-semibold tabular-nums">{voteCount}</span>
        </div>
        {pendingCount > 0 && (
          <>
            <div className="h-4 w-px bg-base-content/10" />
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                {isEpoch1 ? "Reveals later" : "Reveals pending"}
                <InfoTooltip
                  text={
                    isEpoch1
                      ? "Votes are encrypted until the blind phase ends. The keeper normally reveals eligible votes afterward, and users can self-reveal if needed."
                      : "The keeper is revealing votes. Revealed votes are counted toward resolution."
                  }
                  position="bottom"
                />
              </span>
              <span className="font-semibold tabular-nums">{pendingCount}</span>
            </div>
          </>
        )}
      </div>

      {!isEpoch1 && phase === "voting" ? (
        <div className="flex items-center gap-1 text-sm">
          <span className="text-base-content/70">
            {readyToSettle || thresholdReachedAt > 0
              ? "Settlement window is opening now."
              : votersNeeded > 0
                ? `Only ${votersNeeded} more voter${votersNeeded === 1 ? "" : "s"} needed before settlement can start.`
                : revealsNeeded > 0
                  ? `${revealsNeeded} more reveal${revealsNeeded === 1 ? "" : "s"} needed before settlement.`
                  : "This round is close to settlement."}
          </span>
        </div>
      ) : null}

      {hasRevealedVotes && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5 text-success">
            <span className="flex items-center gap-1 font-semibold">
              UP
              <InfoTooltip text="Revealed UP votes and committed cREP." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums">{upPoolFormatted.toFixed(0)} cREP</span>
            <span className="text-xs text-success/70">
              {upCount} vote{upCount === 1 ? "" : "s"}
            </span>
            {higherUpsideSide === "up" ? (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-success">
                Higher upside
              </span>
            ) : null}
          </div>
          <div className="inline-flex items-center gap-2 rounded-full bg-error/10 px-3 py-1.5 text-error">
            <span className="flex items-center gap-1 font-semibold">
              DOWN
              <InfoTooltip text="Revealed DOWN votes and committed cREP." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums">{downPoolFormatted.toFixed(0)} cREP</span>
            <span className="text-xs text-error/70">
              {downCount} vote{downCount === 1 ? "" : "s"}
            </span>
            {higherUpsideSide === "down" ? (
              <span className="rounded-full bg-error/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-error">
                Higher upside
              </span>
            ) : null}
          </div>
        </div>
      )}

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
            text="Rewards are proportional to phase-weighted stake. Blind votes earned the 4× early-voter advantage."
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

      {phase === "revealFailed" && (
        <div className="flex items-center gap-1 text-warning/80">
          <span>Reveal failed — only revealed votes can refund</span>
          <InfoTooltip
            text="Commit quorum was reached, but not enough votes were revealed before the final reveal grace deadline. Revealed voters can claim refunds; unrevealed votes forfeit."
            position="bottom"
          />
        </div>
      )}
    </div>
  );
}
