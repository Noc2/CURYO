"use client";

import { useAccount } from "wagmi";
import { CategoryBars } from "~~/components/leaderboard/CategoryBars";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";
import { getReputationAvatarUrl } from "~~/utils/profileImage";

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
  const avatarSrc = getReputationAvatarUrl(address, 128) || "";
  const winRateLabel = `${(stats.winRate * 100).toFixed(1)}%`;
  const recordLabel = `${stats.totalWins}W / ${stats.totalLosses}L`;

  return (
    <div className="surface-card rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className={surfaceSectionHeadingClassName}>Your voting accuracy</h2>
        <span className="text-base tabular-nums text-base-content/60">{stats.totalSettledVotes} resolved votes</span>
      </div>

      {/* Avatar + side stats */}
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <img
            src={avatarSrc}
            alt="Your profile avatar"
            width={128}
            height={128}
            className="h-28 w-28 shrink-0 rounded-[1.75rem] bg-base-200 object-cover"
          />

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-3xl font-mono font-semibold tabular-nums text-base-content sm:text-4xl">
                {winRateLabel}
              </span>
              <InfoTooltip text="Accuracy is the share of your resolved votes that matched the final settled outcome. The flare around your avatar reflects this same signal." />
            </div>
            <div className="mt-1 font-mono text-base tabular-nums text-base-content/50">{recordLabel}</div>
          </div>
        </div>

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
