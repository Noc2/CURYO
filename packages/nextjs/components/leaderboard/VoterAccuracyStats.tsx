"use client";

import { useAccount } from "wagmi";
import { CategoryBars } from "~~/components/leaderboard/CategoryBars";
import { WinRateRing } from "~~/components/leaderboard/WinRateRing";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";

export function VoterAccuracyStats() {
  const { address } = useAccount();
  const { stats, categories } = useVoterAccuracy(address);

  if (!address) return null;
  if (!stats) {
    return (
      <div className="text-center py-8 text-base-content/50">
        <p>No resolved votes yet</p>
      </div>
    );
  }

  const format = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const formatStake = (s: string) => format(Number(s) / 1e6);

  const streakLabel =
    stats.currentStreak > 0
      ? `${stats.currentStreak}W`
      : stats.currentStreak < 0
        ? `${Math.abs(stats.currentStreak)}L`
        : "0";

  return (
    <div className="surface-card rounded-2xl p-6 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-base-content/60">Your voting accuracy</span>
        <span className="text-base tabular-nums text-base-content/60">{stats.totalSettledVotes} resolved votes</span>
      </div>

      {/* Ring gauge + side stats */}
      <div className="flex items-center gap-5">
        <WinRateRing winRate={stats.winRate} wins={stats.totalWins} losses={stats.totalLosses} />

        <div className="flex flex-col gap-2">
          {/* Streak pills */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-base">
              <span className="text-base-content/50">Streak</span>
              <span className="font-mono tabular-nums">{streakLabel}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-base">
              <span className="text-base-content/50">Best</span>
              <span className="font-mono tabular-nums">{stats.bestWinStreak}W</span>
            </div>
          </div>

          {/* Stake summary */}
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-base">
              <span className="text-base-content/50">Won</span>
              <span className="font-mono tabular-nums text-success">{formatStake(stats.totalStakeWon)} cREP</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-base">
              <span className="text-base-content/50">Lost</span>
              <span className="font-mono tabular-nums text-error">{formatStake(stats.totalStakeLost)} cREP</span>
            </div>
          </div>
        </div>
      </div>

      {/* Per-category breakdown with stacked bars */}
      <CategoryBars categories={categories} />
    </div>
  );
}
