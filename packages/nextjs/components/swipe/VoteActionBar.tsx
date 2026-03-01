"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { TokenBalance } from "~~/components/shared/TokenBalance";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import { useClaimReward } from "~~/hooks/useClaimReward";
import { useClaimableRewards } from "~~/hooks/useClaimableRewards";
import { useRoundInfo } from "~~/hooks/useRoundInfo";

interface VoteActionBarProps {
  contentId: bigint;
  categoryId?: bigint;
  onVote: (isUp: boolean) => void;
  isCommitting: boolean;
  isOwnContent?: boolean;
}

const VOTE_COOLDOWN_SECONDS = 24 * 60 * 60; // 24 hours

/**
 * Vote action bar with total staked stat and vote buttons.
 * When the user has already voted on this content in the current round,
 * replaces vote buttons with a "Voted" indicator (tracked via contract state).
 */
export function VoteActionBar({ contentId, categoryId, onVote, isCommitting, isOwnContent }: VoteActionBarProps) {
  const { address } = useAccount();
  const contentLabel = useContentLabel(categoryId);
  const { round, isLoading, roundId } = useRoundInfo(contentId);
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

  const { data: tokenSymbol } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "symbol",
  });

  const symbol = tokenSymbol ?? "cREP";
  const totalStake = round?.totalStake ?? 0n;
  const formattedStake = Number(totalStake) / 1e6;

  // Read user's vote from the contract
  const { data: myVoteData } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getVote" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: roundId > 0n && !!address },
  } as any);

  const myVoteStake = myVoteData ? Number((myVoteData as any).stake ?? (myVoteData as any)[1] ?? 0n) : 0;
  const myVoteIsUp = myVoteData ? ((myVoteData as any).isUp ?? (myVoteData as any)[2]) : false;
  const hasMyVote = myVoteStake > 0;

  // Vote cooldown: read last vote timestamp from contract (time-based, 24 hours)
  const { data: lastVoteTimeRaw } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "lastVoteTimestamp" as any,
    args: [contentId, address] as any,
  } as any);

  // Tick every 60s so the cooldown transitions from active→inactive without a page reload
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(interval);
  }, []);

  const cooldownInfo = useMemo(() => {
    const lastVoteTime = lastVoteTimeRaw != null ? Number(BigInt(lastVoteTimeRaw as any)) : 0;
    if (lastVoteTime === 0) return { active: false, remaining: 0, hoursRemaining: 0 };
    const elapsed = nowSeconds - lastVoteTime;
    const remaining = Math.max(0, VOTE_COOLDOWN_SECONDS - elapsed);
    const hoursRemaining = Math.ceil(remaining / 3600);
    return { active: remaining > 0, remaining, hoursRemaining };
  }, [lastVoteTimeRaw, nowSeconds]);

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
              onClick={() => claimReward(contentId, claimableEpochId)}
              disabled={isClaiming}
              className="btn btn-success btn-xs mt-1 text-white"
            >
              {isClaiming ? "Claiming..." : `Claim ${(Number(reward) / 1e6).toFixed(0)} ${symbol}`}
            </button>
          )}
          {!claimLoading && hasClaimable && isTie && reward > 0n && (
            <button
              onClick={() => claimTieRefund(contentId, claimableEpochId)}
              disabled={isClaiming}
              className="btn btn-info btn-xs mt-1 text-white"
            >
              {isClaiming ? "Claiming..." : `Tie - Refund ${(Number(reward) / 1e6).toFixed(0)} ${symbol}`}
            </button>
          )}
          {!claimLoading && hasClaimable && !isWinner && !isTie && lost > 0n && (
            <span className="text-error text-xs mt-1">
              Lost {(Number(lost) / 1e6).toFixed(0)} {symbol}
            </span>
          )}
        </div>

        {hasMyVote ? (
          /* Already voted — show indicator */
          <div
            className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
            data-tip={`Your stake is locked until the round settles. After settlement, there is a 24-hour cooldown before you can vote on this ${contentLabel} again.`}
          >
            <span className={`text-base font-semibold ${myVoteIsUp ? "text-success" : "text-error"}`}>
              Voted {myVoteIsUp ? "Up" : "Down"}
            </span>
            <span className="text-base text-base-content/50">
              {(myVoteStake / 1e6).toFixed(0)} {symbol}
            </span>
          </div>
        ) : isOwnContent ? (
          <div
            className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
            data-tip="Content submitters cannot vote on their own submissions."
          >
            <span className="text-base text-base-content/40">Your submission</span>
          </div>
        ) : cooldownInfo.active ? (
          <div
            className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
            data-tip={`You voted on this ${contentLabel} recently. You can vote again in ~${cooldownInfo.hoursRemaining} hour${cooldownInfo.hoursRemaining !== 1 ? "s" : ""}.`}
          >
            <span className="text-base text-base-content/40">Cooldown &middot; ~{cooldownInfo.hoursRemaining}h</span>
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
    </div>
  );
}
