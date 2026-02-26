"use client";

import { useAccount } from "wagmi";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import { useRoundInfo } from "~~/hooks/useRoundInfo";
import { useRoundPhase } from "~~/hooks/useRoundPhase";
import { getRoundSalt } from "~~/utils/tlock";

interface RoundStatsProps {
  contentId: bigint;
  categoryId?: bigint;
}

/**
 * Displays stake and vote statistics for the current round on a specific content.
 * During current epoch: blind stats (commit count + total stake, no direction shown).
 * Past epochs: revealed breakdown (upPool, downPool, upCount, downCount) — cumulative.
 * Shows settlement status ("Awaiting X more votes" or "Ready to settle").
 * Shows user's own vote if they've committed in this round.
 */
export function RoundStats({ contentId, categoryId }: RoundStatsProps) {
  const { address } = useAccount();
  const contentLabel = useContentLabel(categoryId);
  const { round, isLoading, hasReveals, roundId, minVoters, maxVoters, isRoundFull, readyToSettle } =
    useRoundInfo(contentId);
  const { phase } = useRoundPhase(contentId);

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

  // Format stake values from 6 decimals to whole tokens
  const totalStakeFormatted = Number(round.totalStake) / 1e6;
  const voteCount = Number(round.voteCount);
  const revealedCount = round.revealedCount;

  // Revealed pool breakdown (cumulative across epochs)
  const upPoolFormatted = Number(round.upPool) / 1e6;
  const downPoolFormatted = Number(round.downPool) / 1e6;
  const upCount = Number(round.upCount);
  const downCount = Number(round.downCount);

  // Current user's vote in this round (if any)
  const myVote = roundId > 0n ? getRoundSalt(contentId, roundId, address) : null;

  return (
    <div className="flex flex-col gap-1.5 text-base text-base-content/60">
      {/* Blind stats (always shown during open round) */}
      <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Staked
            <InfoTooltip text="Total amount staked in the current round." position="bottom" />
          </span>
          <span className="font-semibold tabular-nums">{totalStakeFormatted.toFixed(0)}</span>
        </div>
        <div className="w-px h-4 bg-base-content/10" />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Commits
            <InfoTooltip
              text={`Number of votes committed on this ${contentLabel} in the current round.`}
              position="bottom"
            />
          </span>
          <span className="font-semibold tabular-nums">{voteCount}</span>
        </div>
        <div className="w-px h-4 bg-base-content/10" />
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            Revealed
            <InfoTooltip
              text="Number of votes that have been decrypted and revealed from past epochs."
              position="bottom"
            />
          </span>
          <span className="font-semibold tabular-nums">{revealedCount}</span>
        </div>
      </div>

      {/* Revealed pool breakdown (cumulative across past epochs) */}
      {hasReveals && (upCount > 0 || downCount > 0) && (
        <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-success">
              UP
              <InfoTooltip text="Cumulative votes and stake in the UP pool from revealed epochs." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums text-success">
              {upCount} ({upPoolFormatted.toFixed(0)} cREP)
            </span>
          </div>
          <div className="w-px h-4 bg-base-content/10" />
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-error">
              DOWN
              <InfoTooltip text="Cumulative votes and stake in the DOWN pool from revealed epochs." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums text-error">
              {downCount} ({downPoolFormatted.toFixed(0)} cREP)
            </span>
          </div>
        </div>
      )}

      {/* User's own vote in this round */}
      {myVote && (
        <div className="flex items-center gap-2">
          <span>Your vote</span>
          <span className="font-semibold tabular-nums">
            {myVote.isUp ? "Up" : "Down"}
            {myVote.stakeAmount != null ? ` · ${myVote.stakeAmount} cREP` : ""}
          </span>
        </div>
      )}

      {/* Settlement status */}
      {phase === "open" && (
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
              Ready to settle
              <InfoTooltip
                text={`At least ${minVoters} votes have been revealed. Anyone can call settle.`}
                position="bottom"
              />
            </span>
          ) : null}
        </div>
      )}

      {phase === "settled" && (
        <div className="flex items-center gap-1 text-success/80">
          <span>Rewards distributed at settlement</span>
          <InfoTooltip
            text="Participation rewards are distributed when the round settles. Winners receive stake from the losing pool proportional to their contribution."
            position="bottom"
          />
        </div>
      )}

      {phase === "cancelled" && (
        <div className="flex items-center gap-1 text-warning/80">
          <span>Round expired — full refund available</span>
          <InfoTooltip
            text="The round expired before enough votes were revealed. All stakes are refunded."
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
