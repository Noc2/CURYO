"use client";

import { useAccount } from "wagmi";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";

export function VoterAccuracyStats() {
  const { address } = useAccount();
  const { stats, categories } = useVoterAccuracy(address);

  if (!address) return null;
  if (!stats) {
    return (
      <div className="text-center py-8 text-base-content/50">
        <p>No settled votes yet</p>
      </div>
    );
  }

  const format = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  const formatStake = (s: string) => format(Number(s) / 1e6);

  const streakLabel =
    stats.currentStreak > 0
      ? `${stats.currentStreak}W`
      : stats.currentStreak < 0
        ? `${Math.abs(stats.currentStreak)}L`
        : "0";

  const entries = [
    { label: "Win Rate", value: formatRate(stats.winRate) },
    { label: "W / L", value: `${stats.totalWins} / ${stats.totalLosses}` },
    { label: "Streak", value: streakLabel },
    { label: "Best Streak", value: `${stats.bestWinStreak}W` },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-base-content/60">Your voting accuracy</span>
        <span className="text-base tabular-nums text-base-content/60">{stats.totalSettledVotes} settled votes</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(e => (
          <div
            key={e.label}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm"
          >
            <span className="text-base-content/50">{e.label}</span>
            <span className="font-mono tabular-nums">{e.value}</span>
          </div>
        ))}
      </div>

      {/* Stake summary */}
      <div className="flex flex-wrap gap-2">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm">
          <span className="text-base-content/50">Won</span>
          <span className="font-mono tabular-nums text-success">{formatStake(stats.totalStakeWon)} cREP</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm">
          <span className="text-base-content/50">Lost</span>
          <span className="font-mono tabular-nums text-error">{formatStake(stats.totalStakeLost)} cREP</span>
        </div>
      </div>

      {/* Per-category breakdown */}
      {categories.length > 0 && (
        <div className="space-y-1">
          <span className="text-sm text-base-content/40">By category</span>
          <div className="flex flex-wrap gap-2">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm"
              >
                <span className="text-base-content/50">{cat.categoryName ?? `#${cat.categoryId}`}</span>
                <span className="font-mono tabular-nums">{formatRate(cat.winRate)}</span>
                <span className="text-base-content/30">
                  ({cat.totalWins}W / {cat.totalLosses}L)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
