"use client";

import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { formatTimeRemaining, useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useClaimReward } from "~~/hooks/useClaimReward";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useVoteHistory } from "~~/hooks/useVoteHistory";
import { useVoterStreak } from "~~/hooks/useVoterStreak";
import { notification } from "~~/utils/scaffold-eth";

const STREAK_INITIAL_RATE_BPS = 9000;

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { claimReward, isClaiming } = useClaimReward();
  const { rateBps } = useParticipationRate();
  const { writeContractAsync: writeVotingEngine, isPending: isClaimingStreak } = useScaffoldWriteContract({
    contractName: "RoundVotingEngine",
  } as any);

  const { votes, isLoading } = useVoteHistory(address);

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

  // Token has 6 decimals
  const formattedBalance = balance
    ? (Number(balance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })
    : "0";

  const settledVoteCount = votes.filter(vote => vote.isSettled).length;

  const { votes: activeVotesWithDeadlines } = useActiveVotesWithDeadlines(address);

  // Build a lookup map for countdown display: "contentId-roundId" -> timeRemaining
  const deadlineMap = new Map<string, number>();
  for (const v of activeVotesWithDeadlines) {
    deadlineMap.set(`${v.contentId}-${v.roundId}`, v.timeRemaining);
  }

  // Show connect wallet prompt if not connected
  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
        <p className="text-base-content/60 mb-6 text-center">Connect your wallet to view your portfolio</p>
        <RainbowKitCustomConnectButton />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-bold mb-6">Portfolio</h1>

        {/* Stats */}
        <div className="bg-base-200 rounded-2xl p-6 mb-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-3xl font-bold tabular-nums">{formattedBalance}</p>
              <p className="text-base text-base-content/50">cREP</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums">
                {isLoading ? <span className="loading loading-dots loading-sm"></span> : votes.length}
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
          <div className="bg-base-200 rounded-2xl p-6 mb-6">
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
                  <span>
                    ~
                    {rateBps
                      ? Math.floor(((streak.nextMilestoneBaseBonus ?? 0) * rateBps) / STREAK_INITIAL_RATE_BPS)
                      : streak.nextMilestoneBaseBonus}{" "}
                    cREP bonus
                  </span>
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
                {streak.milestones.map((m, idx) => {
                  const adjustedBonus = rateBps
                    ? Math.floor((m.baseBonus * rateBps) / STREAK_INITIAL_RATE_BPS)
                    : m.baseBonus;
                  const earned = streak.currentDailyStreak >= m.days;
                  const claimed = streak.lastMilestoneDay >= m.days;
                  const claimable = earned && !claimed;

                  return (
                    <div key={m.days} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className={earned ? "text-success" : "text-base-content/30"}>
                          {claimed ? "&#10003;" : earned ? "&#9679;" : "&#9675;"}
                        </span>
                        <span className={earned ? "" : "text-base-content/50"}>
                          {m.days} days &middot; ~{adjustedBonus} cREP
                        </span>
                      </div>
                      {claimable ? (
                        <button
                          className="btn btn-xs btn-success"
                          disabled={isClaimingStreak}
                          onClick={async () => {
                            try {
                              await (writeVotingEngine as any)({
                                functionName: "claimStreakBonus",
                                args: [BigInt(idx)],
                              });
                              notification.success(`${m.days}-day streak bonus claimed!`);
                            } catch {
                              notification.error("Failed to claim streak bonus");
                            }
                          }}
                        >
                          {isClaimingStreak ? <span className="loading loading-spinner loading-xs"></span> : "Claim"}
                        </button>
                      ) : claimed ? (
                        <span className="badge badge-ghost badge-sm">Claimed</span>
                      ) : (
                        <span className="text-xs text-base-content/30">Locked</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
                const isSettled = vote.isSettled;

                return (
                  <div key={idx} className="bg-base-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-base font-medium">Content #{contentId.toString()}</p>
                      <p className="text-base text-base-content/50">
                        {stake} cREP · Round #{roundId.toString()}
                      </p>
                    </div>
                    {isSettled ? (
                      <button
                        onClick={() => handleClaim(contentId, roundId)}
                        className="text-base font-medium px-4 py-2 rounded-full bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-40"
                        disabled={isClaiming}
                      >
                        {isClaiming ? <span className="loading loading-spinner loading-xs"></span> : "Claim Reward"}
                      </button>
                    ) : (
                      <span
                        className="tooltip tooltip-left text-base font-medium px-4 py-2 rounded-full bg-warning/10 text-warning"
                        data-tip="Max time until round expiry. Rounds usually resolve sooner. Stakes refunded if unresolved."
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
