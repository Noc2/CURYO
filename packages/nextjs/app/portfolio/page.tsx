"use client";

import { useMemo } from "react";
import { useAccount } from "wagmi";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { ClaimRewardsButton } from "~~/components/shared/ClaimRewardsButton";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { formatTimeRemaining, useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useClaimReward } from "~~/hooks/useClaimReward";
import { usePaginatedVoteHistory } from "~~/hooks/usePaginatedVoteHistory";
import { useVoterStreak } from "~~/hooks/useVoterStreak";
import { notification } from "~~/utils/scaffold-eth";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { claimReward, claimTieRefund, isClaiming } = useClaimReward();

  const { votes, totalVotes, settledVoteCount, hasMore, loadMore, isLoading } = usePaginatedVoteHistory(address, {
    pageSize: 50,
  });

  const { data: balance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  const streak = useVoterStreak(address);

  const handleClaim = async (contentId: bigint, roundId: bigint) => {
    const success = await claimReward(contentId, roundId);
    if (success) {
      notification.success("Reward claimed!");
    }
  };

  const handleRefundClaim = async (contentId: bigint, roundId: bigint) => {
    const success = await claimTieRefund(contentId, roundId);
    if (success) {
      notification.success("Refund claimed!");
    }
  };

  // Token has 6 decimals
  const formattedBalance = balance
    ? (Number(balance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "0";

  const { votes: activeVotesWithDeadlines } = useActiveVotesWithDeadlines(address);

  const deadlineMap = useMemo(() => {
    const next = new Map<string, number>();
    for (const vote of activeVotesWithDeadlines) {
      next.set(`${vote.contentId}-${vote.roundId}`, vote.timeRemaining);
    }
    return next;
  }, [activeVotesWithDeadlines]);

  // Show connect wallet prompt if not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
        <p className="text-base-content/60 mb-6 text-center">Sign in to view your portfolio</p>
        <CuryoConnectButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Portfolio</h1>

        <ClaimRewardsButton
          className="mb-6"
          buttonClassName="btn btn-primary btn-sm h-10 min-h-0 w-full rounded-full border-none text-sm"
        />

        {/* Stats */}
        <div className="surface-card mb-6 rounded-2xl p-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold tabular-nums">{formattedBalance}</p>
              <p className="text-base text-base-content/50">cREP</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {isLoading ? <span className="loading loading-dots loading-sm"></span> : totalVotes}
              </p>
              <p className="text-base text-base-content/50">Total Votes</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {isLoading ? <span className="loading loading-dots loading-sm"></span> : settledVoteCount}
              </p>
              <p className="text-base text-base-content/50">Resolved</p>
            </div>
          </div>
        </div>

        {/* Streak Stats */}
        {streak && streak.currentDailyStreak > 0 && (
          <div className="surface-card mb-6 rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-3">Daily Streak</h2>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-3xl font-bold tabular-nums">{streak.currentDailyStreak}</p>
                <p className="text-base text-base-content/50">Current</p>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums">{streak.bestDailyStreak}</p>
                <p className="text-base text-base-content/50">Best</p>
              </div>
              <div>
                <p className="text-3xl font-bold tabular-nums">{streak.totalActiveDays}</p>
                <p className="text-base text-base-content/50">Active Days</p>
              </div>
            </div>
            {streak.nextMilestone && (
              <div className="mt-3">
                <div className="flex justify-between text-xs text-base-content/50 mb-1">
                  <span>Next: {streak.nextMilestone} day milestone</span>
                  <span>Tracking only</span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={streak.currentDailyStreak}
                  max={streak.nextMilestone}
                />
              </div>
            )}

            {/* Milestone list */}
            {streak.milestones && streak.milestones.length > 0 && (
              <div className="mt-4 space-y-2">
                {streak.milestones.map(m => {
                  const earned = streak.currentDailyStreak >= m.days;

                  return (
                    <div key={m.days} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={earned ? "text-success" : "text-base-content/30"}>
                          {earned ? "&#9679;" : "&#9675;"}
                        </span>
                        <span className={earned ? "" : "text-base-content/50"}>{m.days} days milestone</span>
                      </div>
                      <span className="text-xs text-base-content/30">{earned ? "Reached" : "Locked"}</span>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-sm text-base-content/60">
              Streaks are still tracked, but on-chain streak bonus claims are disabled while the reward model is being
              redesigned.
            </p>
          </div>
        )}

        {/* Vote History */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Vote History</h2>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <span className="loading loading-spinner loading-lg text-primary"></span>
            </div>
          ) : votes.length > 0 ? (
            <div className="space-y-3">
              {votes.map((vote, idx) => {
                const contentId = vote.contentId;
                const roundId = vote.roundId;
                const stake = (Number(vote.stake) / 1e6).toFixed(0);
                const claimType = vote.claimType;

                return (
                  <div key={idx} className="bg-base-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-base font-medium">Content #{contentId.toString()}</p>
                      <p className="text-base text-base-content/50">
                        {stake} cREP · Round #{roundId.toString()}
                      </p>
                    </div>
                    {claimType === "reward" ? (
                      <button
                        onClick={() => handleClaim(contentId, roundId)}
                        className="text-base font-medium px-4 py-2 rounded-full bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-40"
                        disabled={isClaiming}
                      >
                        {isClaiming ? <span className="loading loading-spinner loading-xs"></span> : "Claim Reward"}
                      </button>
                    ) : claimType === "refund" ? (
                      <button
                        onClick={() => handleRefundClaim(contentId, roundId)}
                        className="text-base font-medium px-4 py-2 rounded-full bg-warning/10 text-warning hover:bg-warning/20 transition-colors disabled:opacity-40"
                        disabled={isClaiming}
                      >
                        {isClaiming ? <span className="loading loading-spinner loading-xs"></span> : "Claim Refund"}
                      </button>
                    ) : (
                      <span
                        className="tooltip tooltip-left text-base font-medium px-4 py-2 rounded-full bg-warning/10 text-warning"
                        data-tip="Max time until round expiry. Rounds can settle sooner once the revealed-vote threshold and past-epoch reveal checks are satisfied. Below commit quorum at expiry, stakes refund. After commit quorum, missing reveal quorum can end in RevealFailed, where only revealed votes refund."
                      >
                        Active
                        {(() => {
                          const remaining = deadlineMap.get(`${contentId.toString()}-${roundId.toString()}`);
                          return remaining !== undefined ? ` · ${formatTimeRemaining(remaining)}` : "";
                        })()}
                      </span>
                    )}
                  </div>
                );
              })}
              {hasMore ? (
                <button
                  type="button"
                  onClick={loadMore}
                  className="w-full rounded-xl border border-base-content/10 px-4 py-3 text-sm font-medium text-base-content/70 transition-colors hover:border-primary/30 hover:text-base-content"
                >
                  Load more votes
                </button>
              ) : null}
            </div>
          ) : (
            <div className="text-center py-12 text-base-content/40">
              <p className="text-lg mb-2">No votes yet</p>
              <p className="text-base">Start voting on content to build your portfolio!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
