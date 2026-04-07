"use client";

import { useAccount } from "wagmi";
import { ClaimRewardsButton } from "~~/components/shared/ClaimRewardsButton";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";
import { useVoterStreak } from "~~/hooks/useVoterStreak";
import { useWalletSummaryData } from "~~/hooks/useWalletSummaryData";
import { formatCrepAmount } from "~~/lib/vote/voteIncentives";

interface VoteSignalRailProps {
  primaryItem: ContentItem | null;
  activeIndex: number;
  totalCount: number;
  isCommitting: boolean;
  voteError?: string | null;
  cooldownSecondsRemaining: number;
  onVote: (item: ContentItem, isUp: boolean) => void;
}

type SignalStatusTone = "primary" | "neutral" | "success";

function formatPercent(value: number | undefined | null) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function getSignalStatus(args: { totalSettledVotes: number; winRate: number | null; currentStreak: number }): {
  label: string;
  tone: SignalStatusTone;
} {
  const { totalSettledVotes, winRate, currentStreak } = args;

  if (totalSettledVotes < 5 || winRate == null) {
    return { label: "Calibrating", tone: "neutral" };
  }

  if (winRate >= 0.68 && totalSettledVotes >= 40) {
    return { label: "Proven", tone: "success" };
  }

  if (winRate >= 0.58 || currentStreak >= 7) {
    return { label: "Rising", tone: "primary" };
  }

  return { label: "Building", tone: "neutral" };
}

function getStatusChipClassName(tone: SignalStatusTone) {
  switch (tone) {
    case "success":
      return "bg-primary/18 text-primary";
    case "primary":
      return "bg-base-content/[0.08] text-base-content";
    case "neutral":
    default:
      return "bg-base-content/[0.06] text-base-content/75";
  }
}

function RailMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] bg-base-100/70 px-3.5 py-3.5 ring-1 ring-base-content/8">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-base-content/42">{label}</p>
      <p className="mt-2 display-metric text-[1.85rem] text-base-content">{value}</p>
    </div>
  );
}

export function VoteSignalRail({
  primaryItem,
  activeIndex,
  totalCount,
  isCommitting,
  voteError,
  cooldownSecondsRemaining,
  onVote,
}: VoteSignalRailProps) {
  const { address } = useAccount();
  const { liquidBalance, summary } = useWalletSummaryData(address);
  const { stats } = useVoterAccuracy(address);
  const streak = useVoterStreak(address);
  const { totalClaimable } = useAllClaimableRewards();

  const totalSettledVotes = stats?.totalSettledVotes ?? 0;
  const winRate = stats?.winRate ?? null;
  const currentStreak = streak?.currentDailyStreak ?? 0;
  const status = getSignalStatus({
    totalSettledVotes,
    winRate,
    currentStreak,
  });

  const totalCrepMicro = summary?.totalMicro ?? liquidBalance ?? 0n;
  const totalStakedMicro = summary?.totalStakedMicro ?? 0n;
  const currentCardLabel =
    primaryItem != null && activeIndex >= 0 ? `${activeIndex + 1} / ${Math.max(totalCount, activeIndex + 1)}` : "—";

  return (
    <aside className="surface-card flex h-full min-h-0 flex-col overflow-y-auto rounded-[2rem] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-full bg-base-content/[0.05] px-3 py-1.5 text-xs font-medium text-base-content/68">
            Card {currentCardLabel}
          </div>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-sm font-semibold ${getStatusChipClassName(status.tone)}`}>
          {status.label}
        </div>
      </div>

      {primaryItem ? (
        <div className="mt-4">
          <VotingQuestionCard
            contentId={primaryItem.id}
            categoryId={primaryItem.categoryId}
            currentRating={primaryItem.rating}
            openRound={primaryItem.openRound}
            onVote={isUp => onVote(primaryItem, isUp)}
            isCommitting={isCommitting}
            address={address}
            error={voteError}
            cooldownSecondsRemaining={cooldownSecondsRemaining}
            isOwnContent={primaryItem.isOwnContent}
            compact
            variant="signal"
          />
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <RailMetric label="Total cREP" value={address ? formatCrepAmount(totalCrepMicro, 0) : "—"} />
        <RailMetric label="Staked" value={address ? formatCrepAmount(totalStakedMicro, 0) : "—"} />
        <RailMetric label="Accuracy" value={address ? formatPercent(winRate) : "—"} />
        <RailMetric label="Status" value={address ? status.label : "—"} />
      </div>

      {address && totalClaimable > 0n ? (
        <div className="mt-4">
          <ClaimRewardsButton buttonClassName="btn btn-primary btn-sm h-10 min-h-0 w-full rounded-full border-none text-sm" />
        </div>
      ) : null}
    </aside>
  );
}
