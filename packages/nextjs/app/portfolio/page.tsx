"use client";

import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { formatTimeRemaining, useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useClaimReward } from "~~/hooks/useClaimReward";
import { useVoterStreak } from "~~/hooks/useVoterStreak";
import { notification } from "~~/utils/scaffold-eth";

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const { claimReward, isClaiming } = useClaimReward();

  const { data: commitEvents, isLoading: commitsLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "VoteCommitted",
    fromBlock: 0n,
    filters: { voter: address },
    watch: true,
  } as any);

  const { data: settledEvents, isLoading: settledLoading } = useScaffoldEventHistory({
    contractName: "RoundVotingEngine",
    eventName: "RoundSettled",
    fromBlock: 0n,
    watch: true,
  } as any);

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

  // Count settled rounds where user participated
  const settledRoundKeys = new Set(
    settledEvents
      ?.map(e => {
        const args = e.args as { contentId?: bigint; roundId?: bigint };
        if (args.contentId === undefined || args.roundId === undefined) return null;
        return `${args.contentId.toString()}-${args.roundId.toString()}`;
      })
      .filter((key): key is string => Boolean(key)) ?? [],
  );
  const settledVoteCount =
    commitEvents?.filter(e => {
      const args = e.args as { contentId?: bigint; roundId?: bigint };
      if (args.contentId === undefined || args.roundId === undefined) return false;
      return settledRoundKeys.has(`${args.contentId.toString()}-${args.roundId.toString()}`);
    }).length ?? 0;

  const { votes: activeVotesWithDeadlines } = useActiveVotesWithDeadlines(address);

  // Build a lookup map for countdown display: "contentId-roundId" -> timeRemaining
  const deadlineMap = new Map<string, number>();
  for (const v of activeVotesWithDeadlines) {
    deadlineMap.set(`${v.contentId}-${v.roundId}`, v.timeRemaining);
  }

  const isLoading = commitsLoading || settledLoading;

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
              <p className="text-3xl font-bold tabular-nums">{commitEvents?.length ?? 0}</p>
              <p className="text-base text-base-content/50">Total Votes</p>
            </div>
            <div>
              <p className="text-3xl font-bold tabular-nums">{settledVoteCount}</p>
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
                  <span>{streak.nextMilestoneBonus} cREP bonus</span>
                </div>
                <progress
                  className="progress progress-primary w-full"
                  value={streak.currentDailyStreak}
                  max={streak.nextMilestone}
                />
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
          ) : commitEvents && commitEvents.length > 0 ? (
            <div className="space-y-3">
              {commitEvents.map((event, idx) => {
                const args = event.args as { contentId?: bigint; roundId?: bigint; stake?: bigint };
                const contentId = args.contentId;
                const roundId = args.roundId;
                const stake = args.stake ? (Number(args.stake) / 1e6).toFixed(0) : "?";

                const isSettled =
                  contentId !== undefined &&
                  roundId !== undefined &&
                  settledRoundKeys.has(`${contentId.toString()}-${roundId.toString()}`);

                return (
                  <div key={idx} className="bg-base-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <p className="text-base font-medium">Content #{contentId?.toString() ?? "?"}</p>
                      <p className="text-base text-base-content/50">
                        {stake} cREP · Round #{roundId?.toString() ?? "?"}
                      </p>
                    </div>
                    {isSettled ? (
                      <button
                        onClick={() => contentId && roundId && handleClaim(contentId, roundId)}
                        className="text-base font-medium px-4 py-2 rounded-full bg-success/10 text-success hover:bg-success/20 transition-colors disabled:opacity-40"
                        disabled={isClaiming || !contentId || !roundId}
                      >
                        {isClaiming ? <span className="loading loading-spinner loading-xs"></span> : "Claim Reward"}
                      </button>
                    ) : (
                      <span
                        className="tooltip tooltip-left text-base font-medium px-4 py-2 rounded-full bg-warning/10 text-warning"
                        data-tip="Max time until round expiry. Rounds usually settle sooner. Stakes refunded if unsettled."
                      >
                        Active
                        {contentId !== undefined &&
                          roundId !== undefined &&
                          (() => {
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
