"use client";

import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { ClaimRewardsButton } from "~~/components/shared/ClaimRewardsButton";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";
import { useVoterStreak } from "~~/hooks/useVoterStreak";
import { useWalletSummaryData } from "~~/hooks/useWalletSummaryData";
import { estimateVoteReturn, formatCrepAmount } from "~~/lib/vote/voteIncentives";

interface VoteSignalRailProps {
  primaryItem: ContentItem | null;
  activeIndex: number;
  totalCount: number;
  viewLabel: string;
}

type SignalStatusTone = "primary" | "neutral" | "success";

const PREVIEW_STAKE_AMOUNT = 5;

function formatPercent(value: number | undefined | null) {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatCount(value: number | undefined | null) {
  if (value == null) return "0";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function getSignalStatus(args: { totalSettledVotes: number; winRate: number | null; currentStreak: number }): {
  label: string;
  detail: string;
  tone: SignalStatusTone;
} {
  const { totalSettledVotes, winRate, currentStreak } = args;

  if (totalSettledVotes < 5 || winRate == null) {
    return {
      label: "Calibrating",
      detail: "Resolve 5 votes to establish a tracked signal.",
      tone: "neutral",
    };
  }

  if (winRate >= 0.68 && totalSettledVotes >= 40) {
    return {
      label: "Proven",
      detail: `${formatPercent(winRate)} accuracy · ${currentStreak} day streak`,
      tone: "success",
    };
  }

  if (winRate >= 0.58 && totalSettledVotes >= 15) {
    return {
      label: "Rising",
      detail: `${formatPercent(winRate)} accuracy · ${currentStreak} day streak`,
      tone: "primary",
    };
  }

  return {
    label: "Building",
    detail: `${formatPercent(winRate)} accuracy · ${currentStreak} day streak`,
    tone: "neutral",
  };
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

function SignalMetricCard({
  label,
  value,
  detail,
  tooltip,
  valueClassName,
}: {
  label: string;
  value: string;
  detail: string;
  tooltip?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[1.5rem] bg-base-100/70 px-4 py-4 ring-1 ring-base-content/8">
      <div className="flex items-center gap-1.5">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-base-content/45">{label}</p>
        {tooltip ? <InfoTooltip text={tooltip} position="bottom" /> : null}
      </div>
      <p
        className={`mt-2 tabular-nums text-base-content ${
          valueClassName ?? "display-metric text-[2rem] sm:text-[2.35rem]"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-base-content/55">{detail}</p>
    </div>
  );
}

export function VoteSignalRail({ primaryItem, activeIndex, totalCount, viewLabel }: VoteSignalRailProps) {
  const { address } = useAccount();
  const [previewIsUp, setPreviewIsUp] = useState(true);
  const { activeVotes, earliestReveal, hasPendingReveals, liquidBalance, summary } = useWalletSummaryData(address);
  const { stats } = useVoterAccuracy(address);
  const streak = useVoterStreak(address);
  const { totalClaimable } = useAllClaimableRewards();
  const { calculateBonus } = useParticipationRate();
  const roundSnapshot = useRoundSnapshot(primaryItem?.id, primaryItem?.openRound ?? undefined);

  const totalSettledVotes = stats?.totalSettledVotes ?? 0;
  const winRate = stats?.winRate ?? null;
  const currentStreak = streak?.currentDailyStreak ?? 0;
  const totalCrepMicro = summary?.totalMicro ?? liquidBalance ?? 0n;
  const totalStakedMicro = summary?.totalStakedMicro ?? 0n;
  const votingStakedMicro = summary?.votingStakedMicro ?? 0n;
  const submissionStakedMicro = summary?.submissionStakedMicro ?? 0n;
  const nextActionLabel = hasPendingReveals
    ? "Reveal pending"
    : earliestReveal
      ? `Next reveal ${earliestReveal}`
      : activeVotes.length > 0
        ? "Vote stake locked"
        : "No active unlocks";

  const status = getSignalStatus({
    totalSettledVotes,
    winRate,
    currentStreak,
  });

  const effectiveBlind = roundSnapshot.phase !== "voting" || roundSnapshot.isEpoch1;
  const previewBonus = calculateBonus(PREVIEW_STAKE_AMOUNT);
  const previewEstimate = useMemo(() => {
    if (!primaryItem) return null;
    return estimateVoteReturn({ ...roundSnapshot, isEpoch1: effectiveBlind }, previewIsUp, PREVIEW_STAKE_AMOUNT);
  }, [effectiveBlind, previewIsUp, primaryItem, roundSnapshot]);

  const previewBonusMicro = previewBonus != null ? BigInt(Math.round(previewBonus * 1e6)) : 0n;
  const previewGrossLabel =
    previewEstimate != null
      ? formatCrepAmount(previewEstimate.estimatedGrossReturnMicro + previewBonusMicro)
      : formatCrepAmount(PREVIEW_STAKE_AMOUNT);
  const previewRefundLabel =
    previewEstimate != null ? formatCrepAmount(previewEstimate.revealedLoserRefundMicro + previewBonusMicro) : "0";
  const participationLabel =
    previewBonus != null
      ? `+${previewBonus.toLocaleString(undefined, { maximumFractionDigits: 1 })} cREP bonus`
      : "Bonus loading";
  const currentCardLabel =
    primaryItem != null && activeIndex >= 0 ? `${activeIndex + 1} / ${Math.max(totalCount, activeIndex + 1)}` : "—";
  const totalCrepLabel = address ? formatCrepAmount(totalCrepMicro, 0) : "—";
  const totalStakedLabel = address ? formatCrepAmount(totalStakedMicro, 0) : "—";
  const accuracyLabel = address ? formatPercent(winRate) : "—";
  const statusValue = address ? status.label : "—";
  const claimableLabel = address ? formatCrepAmount(totalClaimable, 0) : "—";
  const totalCrepDetail = address
    ? `Liquid ${formatCrepAmount(liquidBalance ?? 0n, 0)} · Claimable ${claimableLabel}`
    : "Connect to load your cREP footprint and rewards.";
  const stakedDetail = address
    ? totalStakedMicro > 0n
      ? `Voting ${formatCrepAmount(votingStakedMicro, 0)} · Submission ${formatCrepAmount(submissionStakedMicro, 0)}`
      : "No active voting or submission stake yet."
    : "Track locked stake and reveal timing here.";
  const statusDetail = address
    ? `${status.detail} · ${nextActionLabel}`
    : "A compact snapshot of momentum and unlocks.";
  const claimButtonClassName =
    "btn btn-primary btn-sm h-10 min-h-0 rounded-full border-none px-4 text-sm shadow-[0_14px_30px_rgb(242_100_38_/_0.18)]";
  const roundSignalCopy = effectiveBlind
    ? "Blind votes stay hidden and keep full reward weight before revealed signal appears."
    : "Open votes can use the live signal, but informed weight is reduced after the blind phase.";

  return (
    <aside className="surface-card rounded-[2rem] p-5 sm:p-6 xl:sticky xl:top-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="display-section text-[2rem] text-base-content">Signal Rail</p>
          <p className="mt-1 text-sm text-base-content/55">
            {viewLabel} · Card {currentCardLabel}
          </p>
        </div>
        <div className={`rounded-full px-3 py-1.5 text-sm font-semibold ${getStatusChipClassName(status.tone)}`}>
          {status.label}
        </div>
      </div>

      <p className="mt-3 text-sm leading-relaxed text-base-content/58">{status.detail}</p>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <SignalMetricCard
          label="Total cREP"
          value={totalCrepLabel}
          detail={totalCrepDetail}
          tooltip="This combines your liquid cREP with currently staked cREP to show your live voting footprint."
        />
        <SignalMetricCard
          label="Staked"
          value={totalStakedLabel}
          detail={stakedDetail}
          tooltip="Active voting stake stays locked until reveal or round settlement. Submission stake remains live while the content is active."
        />
        <SignalMetricCard
          label="Accuracy"
          value={accuracyLabel}
          detail={
            address
              ? `${formatCount(totalSettledVotes)} resolved votes tracked`
              : "Your settled vote record lives here."
          }
          tooltip="Accuracy is the share of resolved votes that matched the final outcome."
        />
        <SignalMetricCard
          label="Status"
          value={statusValue}
          detail={statusDetail}
          tooltip="Status is derived from resolved accuracy and recent streak momentum. It is a lightweight summary, not a permanent rank."
          valueClassName="text-[1.35rem] font-semibold uppercase tracking-[0.08em] sm:text-[1.55rem]"
        />
      </div>

      {!address ? (
        <div className="mt-5 rounded-[1.5rem] bg-base-100/70 p-4 ring-1 ring-base-content/8">
          <p className="text-base font-semibold text-base-content">Connect to personalize this rail</p>
          <p className="mt-1 text-sm leading-relaxed text-base-content/58">
            See cREP balance, active stake, accuracy, streaks, and round-specific reward previews while browsing.
          </p>
          <div className="mt-4">
            <CuryoConnectButton />
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center justify-between gap-3 rounded-[1.5rem] bg-base-100/70 px-4 py-3 ring-1 ring-base-content/8">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-base-content/45">Claimable</p>
            <p className="mt-1 text-sm font-medium text-base-content">
              {claimableLabel} cREP ready
              <span className="ml-2 text-base-content/48">· {nextActionLabel}</span>
            </p>
          </div>
          {totalClaimable > 0n ? (
            <ClaimRewardsButton className="shrink-0" buttonClassName={claimButtonClassName} />
          ) : (
            <span className="rounded-full bg-base-content/[0.05] px-3 py-2 text-sm font-medium text-base-content/55">
              Nothing ready yet
            </span>
          )}
        </div>
      )}

      <div className="mt-5 rounded-[1.65rem] bg-base-100/72 p-4 ring-1 ring-base-content/8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-base-content/45">
              Current round edge
            </p>
            <p className="mt-2 line-clamp-2 text-base font-semibold text-base-content">
              {primaryItem?.title ?? "Select a card to preview round rewards"}
            </p>
          </div>
          <div className="rounded-full bg-primary/14 px-3 py-1.5 text-sm font-semibold text-primary">
            {effectiveBlind ? "Blind · 4× weight" : "Open · 25% weight"}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-base-content/[0.05] px-3 py-1.5 text-sm font-medium text-base-content/68">
            {viewLabel}
          </span>
          <span className="rounded-full bg-base-content/[0.05] px-3 py-1.5 text-sm font-medium text-base-content/68">
            Card {currentCardLabel}
          </span>
          <span className="rounded-full bg-base-content/[0.05] px-3 py-1.5 text-sm font-medium text-base-content/68">
            {participationLabel}
          </span>
        </div>

        {primaryItem ? (
          <>
            <div className="mt-4 inline-flex rounded-full bg-base-content/[0.05] p-1">
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  previewIsUp ? "bg-base-content text-base-100" : "text-base-content/62"
                }`}
                onClick={() => setPreviewIsUp(true)}
              >
                Score too low
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  !previewIsUp ? "bg-base-content text-base-100" : "text-base-content/62"
                }`}
                onClick={() => setPreviewIsUp(false)}
              >
                Score too high
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-[1.25rem] bg-base-content/[0.04] px-4 py-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-base-content/40">
                  If correct
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-base-content">{previewGrossLabel} cREP</p>
                <p className="mt-1 text-sm text-base-content/52">Sample {PREVIEW_STAKE_AMOUNT} cREP gross return</p>
              </div>
              <div className="rounded-[1.25rem] bg-base-content/[0.04] px-4 py-3">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-base-content/40">If wrong</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-base-content">{previewRefundLabel} cREP</p>
                <p className="mt-1 text-sm text-base-content/52">Revealed refund plus participation bonus</p>
              </div>
            </div>

            <div className="mt-4 rounded-[1.25rem] bg-primary/10 px-4 py-3 text-sm text-primary">{roundSignalCopy}</div>
          </>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-base-content/55">
            As you move through the feed, this panel can preview reward weight, likely gross return, and downside refund
            for the current round.
          </p>
        )}
      </div>
    </aside>
  );
}
