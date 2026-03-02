"use client";

import { useAccount } from "wagmi";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import { useRoundInfo } from "~~/hooks/useRoundInfo";
import { useRoundPhase } from "~~/hooks/useRoundPhase";

interface RoundStatsProps {
  contentId: bigint;
  categoryId?: bigint;
}

/**
 * Displays stake and vote statistics for the current round on a specific content.
 * All votes are public — shows UP/DOWN pools and share counts in real-time.
 * Shows settlement status ("Awaiting X more votes" or "Ready to settle").
 * Shows user's own vote if they've voted in this round.
 */
export function RoundStats({ contentId, categoryId }: RoundStatsProps) {
  const { address } = useAccount();
  const contentLabel = useContentLabel(categoryId);
  const { round, isLoading, roundId, minVoters, maxVoters, isRoundFull, readyToSettle } = useRoundInfo(contentId);
  const { phase } = useRoundPhase(contentId);

  // Read user's vote from the contract
  const { data: myVoteData } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getVote" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: roundId > 0n && !!address },
  } as any);

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

  // Pool breakdown (all public in real-time)
  const upStakeFormatted = Number(round.upStake) / 1e6;
  const downStakeFormatted = Number(round.downStake) / 1e6;
  const upCount = Number(round.upCount);
  const downCount = Number(round.downCount);

  // Parse user's vote from contract data
  const myVoteStake = myVoteData ? Number((myVoteData as any).stake ?? (myVoteData as any)[1] ?? 0n) : 0;
  const myVoteIsUp = myVoteData ? ((myVoteData as any).isUp ?? (myVoteData as any)[2]) : false;
  const hasMyVote = myVoteStake > 0;

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
            <InfoTooltip text={`Number of votes on this ${contentLabel} in the current round.`} position="bottom" />
          </span>
          <span className="font-semibold tabular-nums">{voteCount}</span>
        </div>
      </div>

      {/* UP/DOWN pool breakdown */}
      {(upCount > 0 || downCount > 0) && (
        <div className="flex items-center gap-x-3 gap-y-1.5 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-success">
              UP
              <InfoTooltip text="Votes and cREP in the UP pool." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums text-success">
              {upCount} ({upStakeFormatted.toFixed(0)} cREP)
            </span>
          </div>
          <div className="w-px h-4 bg-base-content/10" />
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-error">
              DOWN
              <InfoTooltip text="Votes and cREP in the DOWN pool." position="bottom" />
            </span>
            <span className="font-semibold tabular-nums text-error">
              {downCount} ({downStakeFormatted.toFixed(0)} cREP)
            </span>
          </div>
        </div>
      )}

      {/* User's own vote in this round */}
      {hasMyVote && (
        <div className="flex items-center gap-2">
          <span>Your vote</span>
          <span className="font-semibold tabular-nums">
            {myVoteIsUp ? "Up" : "Down"} · {(myVoteStake / 1e6).toFixed(0)} cREP
          </span>
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
              Ready to resolve
              <InfoTooltip
                text={`At least ${minVoters} votes have been cast. Resolution can happen at any time.`}
                position="bottom"
              />
            </span>
          ) : null}
        </div>
      )}

      {phase === "settled" && (
        <div className="flex items-center gap-1 text-success/80">
          <span>Rewards distributed</span>
          <InfoTooltip
            text="Participation rewards are distributed when the round is resolved. Winners receive cREP from the losing pool based on their reward points."
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
