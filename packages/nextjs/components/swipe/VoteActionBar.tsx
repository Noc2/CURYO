"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { RewardRevealModal } from "~~/components/shared/RewardRevealModal";
import { TokenBalance } from "~~/components/shared/TokenBalance";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useClaimReward } from "~~/hooks/useClaimReward";
import { useClaimableRewards } from "~~/hooks/useClaimableRewards";
import { useRoundCountdown } from "~~/hooks/useRoundCountdown";
import { useRoundInfo } from "~~/hooks/useRoundInfo";

interface VoteActionBarProps {
  contentId: bigint;
  categoryId?: bigint;
  onVote: (isUp: boolean) => void;
  isCommitting: boolean;
  isOwnContent?: boolean;
}

type RevealModalState = {
  outcome: "win" | "loss" | "tie";
  amount: bigint;
  stake: bigint;
  upPool: bigint;
  downPool: bigint;
} | null;

/**
 * Vote action bar with total staked stat and vote buttons.
 * When the user has already voted on this content in the current round,
 * replaces vote buttons with a "Voted" indicator (tracked via contract state).
 */
export function VoteActionBar({ contentId, onVote, isCommitting, isOwnContent }: VoteActionBarProps) {
  const { address } = useAccount();
  const { round, isLoading, roundId } = useRoundInfo(contentId);
  const { label: countdownLabel, urgency, isActive: countdownActive } = useRoundCountdown(contentId);
  const {
    hasClaimable,
    epochId: claimableEpochId,
    reward,
    lost,
    isWinner,
    isTie,
    isLoading: claimLoading,
  } = useClaimableRewards(contentId);
  const { claimReward, claimTieRefund, isClaiming } = useClaimReward();
  const [revealModal, setRevealModal] = useState<RevealModalState>(null);

  const { data: tokenSymbol } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "symbol",
  });

  const symbol = tokenSymbol ?? "cREP";
  const totalStake = round?.totalStake ?? 0n;
  const formattedStake = Number(totalStake) / 1e6;

  // Check if user has committed to this round (tlock: direction hidden until reveal)
  // voterCommitHash(contentId, roundId, voter) returns bytes32 (0 = no commit)
  const { data: myCommitHash } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "voterCommitHash" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: roundId > 0n && !!address },
  } as any);

  const hasMyVote =
    myCommitHash != null &&
    (myCommitHash as unknown as string) !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  const openReveal = (outcome: "win" | "loss" | "tie", amount: bigint, stake: bigint) => {
    setRevealModal({
      outcome,
      amount,
      stake,
      upPool: round?.upPool ?? 0n,
      downPool: round?.downPool ?? 0n,
    });
  };

  return (
    <div className="flex flex-col items-center gap-1 w-full">
      <div className="flex items-center justify-center gap-3 w-full">
        {/* Total Staked stat - left side */}
        <div className="flex flex-col items-end min-w-[70px]">
          <span className="text-base text-base-content/40">Total Staked</span>
          {isLoading ? (
            <div className="h-5 w-12 bg-base-content/10 rounded animate-pulse" />
          ) : (
            <span className="text-base font-semibold tabular-nums text-base-content/70">
              {formattedStake.toFixed(0)} {symbol}
            </span>
          )}
          {/* Claimable rewards indicator */}
          {!claimLoading && hasClaimable && isWinner && reward > 0n && (
            <button
              onClick={() => openReveal("win", reward, lost > 0n ? lost : reward)}
              disabled={isClaiming}
              className="btn btn-success btn-xs mt-1 text-white"
            >
              {isClaiming ? "Claiming..." : `Claim ${(Number(reward) / 1e6).toFixed(0)} ${symbol}`}
            </button>
          )}
          {!claimLoading && hasClaimable && isTie && reward > 0n && (
            <button
              onClick={() => openReveal("tie", reward, reward)}
              disabled={isClaiming}
              className="btn btn-info btn-xs mt-1 text-white"
            >
              {isClaiming ? "Claiming..." : `Tie - Refund ${(Number(reward) / 1e6).toFixed(0)} ${symbol}`}
            </button>
          )}
          {!claimLoading && hasClaimable && !isWinner && !isTie && lost > 0n && (
            <button
              onClick={() => openReveal("loss", lost, lost)}
              className="text-error text-xs mt-1 hover:underline cursor-pointer bg-transparent border-none p-0"
            >
              Lost {(Number(lost) / 1e6).toFixed(0)} {symbol}
            </button>
          )}
          {countdownActive && (
            <span
              className={`text-xs mt-1 tabular-nums ${
                urgency === "critical"
                  ? "text-error animate-pulse"
                  : urgency === "warning"
                    ? "text-warning"
                    : "text-base-content/40"
              }`}
            >
              {countdownLabel}
            </span>
          )}
        </div>

        {hasMyVote ? (
          /* Already committed — direction hidden until epoch ends */
          <div
            className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
            data-tip={`Your vote is committed and hidden until the epoch ends. The keeper will reveal it automatically.`}
          >
            <span className="text-base font-semibold text-primary">Committed</span>
            <span className="text-base text-base-content/50">hidden</span>
          </div>
        ) : isOwnContent ? (
          <div
            className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
            data-tip="Content submitters cannot vote on their own submissions."
          >
            <span className="text-base text-base-content/40">Your submission</span>
          </div>
        ) : (
          /* No vote yet — show vote buttons */
          <>
            <button
              onClick={() => onVote(false)}
              className="vote-btn vote-no"
              disabled={isCommitting}
              aria-label="Vote no"
            >
              <span className="vote-bg" />
              <span className="vote-symbol">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-sm"
                >
                  <path d="M12 18 L6 6 L18 6 Z" />
                </svg>
              </span>
            </button>

            {/* Token balance - center */}
            <TokenBalance />

            <button
              onClick={() => onVote(true)}
              className="vote-btn vote-yes"
              disabled={isCommitting}
              aria-label="Vote yes"
            >
              <span className="vote-bg" />
              <span className="vote-symbol">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="drop-shadow-sm"
                >
                  <path d="M12 6 L6 18 L18 18 Z" />
                </svg>
              </span>
            </button>
          </>
        )}
      </div>

      {/* Reward reveal modal */}
      {revealModal && (
        <RewardRevealModal
          isOpen={true}
          outcome={revealModal.outcome}
          amount={revealModal.amount}
          stake={revealModal.stake}
          upPool={revealModal.upPool}
          downPool={revealModal.downPool}
          onClaim={() => {
            if (revealModal.outcome === "win") {
              claimReward(contentId, claimableEpochId);
            } else if (revealModal.outcome === "tie") {
              claimTieRefund(contentId, claimableEpochId);
            }
          }}
          onClose={() => setRevealModal(null)}
        />
      )}
    </div>
  );
}
