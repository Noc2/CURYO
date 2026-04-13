"use client";

import { type ReactNode, useEffect, useState } from "react";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { CuryoVoteButton } from "~~/components/shared/CuryoVoteButton";
import { MoreToggleButton } from "~~/components/shared/MoreToggleButton";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RatingOrb } from "~~/components/shared/RatingOrb";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundRevealedBreakdown, RoundStats } from "~~/components/shared/RoundStats";
import { HoverTooltip, InfoTooltip } from "~~/components/ui/InfoTooltip";
import type { ContentOpenRoundSummary } from "~~/hooks/contentFeed/shared";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import { formatVoteCooldownRemaining } from "~~/lib/vote/cooldown";
import { describeOpenRoundActivity, formatCrepAmount, getRoundProgressMessaging } from "~~/lib/vote/voteIncentives";
import { computeVoteProgressIconCounts } from "~~/lib/vote/voteProgressIcons";

interface VotingQuestionCardProps {
  contentId: bigint;
  categoryId: bigint;
  currentRating: number;
  onVote: (isUp: boolean) => void;
  isCommitting: boolean;
  address?: string;
  error?: string | null;
  cooldownSecondsRemaining?: number;
  isCooldownLoading?: boolean;
  isOwnContent?: boolean;
  openRound?: ContentOpenRoundSummary | null;
  /** When true, removes card background/rounding (parent provides it). */
  embedded?: boolean;
  compact?: boolean;
  variant?: "default" | "signal" | "dock";
  attentionToken?: number | null;
}

const RATING_GUIDANCE_TEXT =
  "The community score runs from 0.0 to 10.0, where higher means better. Vote up when content deserves a better score and vote down when it deserves a worse one. Always vote down illegal, broken, or misdescribed content.";
export const VOTING_SURFACE_BACKGROUND = "var(--curyo-surface-elevated)";
const STATUS_PILL_CLASS_NAME =
  "inline-flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2";
const DOCK_STATUS_TEXT_CLASS_NAME =
  "inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 py-0.5 text-left leading-none";

type ActivityTone = "primary" | "warning" | "success" | "neutral";

function getActivityToneClassName(tone: ActivityTone) {
  switch (tone) {
    case "primary":
      return "bg-primary/12 text-primary";
    case "warning":
      return "bg-warning/12 text-warning";
    case "success":
      return "bg-success/12 text-success";
    case "neutral":
    default:
      return "bg-base-content/[0.06] text-base-content/72";
  }
}

function getActivityDetailToneClassName(tone: ActivityTone) {
  switch (tone) {
    case "success":
      return "text-success/80";
    case "warning":
      return "text-warning";
    case "primary":
      return "text-primary/80";
    case "neutral":
    default:
      return "text-base-content/75";
  }
}

function VoteParticipationIcons({
  filledVoteIcons,
  emptyVoteIcons,
  tooltip,
}: {
  filledVoteIcons: number;
  emptyVoteIcons: number;
  tooltip: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex -space-x-1">
        {Array.from({ length: filledVoteIcons }).map((_, i) => (
          <svg
            key={`filled-${i}`}
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5 text-primary"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        ))}
        {Array.from({ length: emptyVoteIcons }).map((_, i) => (
          <svg
            key={`empty-${i}`}
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5 text-base-content/30"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        ))}
      </span>
      <InfoTooltip text={tooltip} position="bottom" />
    </span>
  );
}

function InlineVotingSummary({
  snapshot,
  filledVoteIcons,
  emptyVoteIcons,
  compact,
  stackForNarrowRail = false,
  alignLeft = false,
  statusContent,
  statusPlacement = "afterProgress",
}: {
  snapshot: ReturnType<typeof useRoundSnapshot>;
  filledVoteIcons: number;
  emptyVoteIcons: number;
  compact: boolean;
  stackForNarrowRail?: boolean;
  alignLeft?: boolean;
  statusContent?: ReactNode;
  statusPlacement?: "beforeProgress" | "afterProgress";
}) {
  const { ratePercent } = useParticipationRate();
  const progressMessaging = getRoundProgressMessaging(snapshot, ratePercent);
  const pendingRevealCount = Math.max(0, snapshot.voteCount - snapshot.revealedCount);
  const voteTooltip = `${snapshot.voteCount} vote${snapshot.voteCount === 1 ? "" : "s"} committed in this round. ${snapshot.revealedCount} revealed.${pendingRevealCount > 0 ? ` ${pendingRevealCount} commit${pendingRevealCount === 1 ? "" : "s"} still pending reveal.` : ""} ${Math.max(0, snapshot.minVoters - snapshot.revealedCount) > 0 ? `${Math.max(0, snapshot.minVoters - snapshot.revealedCount)} more revealed vote${Math.max(0, snapshot.minVoters - snapshot.revealedCount) === 1 ? "" : "s"} needed before settlement can start.` : "Threshold reached. Settlement follows once past-epoch reveal checks clear."}`;
  const showVoteIcons = snapshot.phase === "voting";
  const showRevealedBreakdown = snapshot.round.revealedCount > 0;
  const useCompactInlineRows = compact && alignLeft && !stackForNarrowRail;

  if (!showVoteIcons && !progressMessaging && !showRevealedBreakdown) {
    return null;
  }

  const statusRow = statusContent ? (
    <div className={`flex w-full ${alignLeft ? "justify-start" : "justify-center"}`}>{statusContent}</div>
  ) : null;

  return (
    <div
      className={`flex w-full flex-col ${alignLeft ? "items-start" : "items-center"} ${compact ? "gap-2" : "gap-2.5"}`}
    >
      {showVoteIcons ? (
        <VoteParticipationIcons
          filledVoteIcons={filledVoteIcons}
          emptyVoteIcons={emptyVoteIcons}
          tooltip={voteTooltip}
        />
      ) : null}
      {statusPlacement === "beforeProgress" ? statusRow : null}
      {progressMessaging ? (
        <div
          className={`flex text-base text-base-content/75 ${
            useCompactInlineRows
              ? "w-full flex-wrap items-center gap-x-2 gap-y-1 text-left"
              : alignLeft || stackForNarrowRail
                ? "w-full flex-col items-start gap-1 text-left"
                : "flex-wrap items-center justify-center gap-x-2.5 gap-y-1.5 text-center"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span
              className={`badge badge-sm gap-1 text-base ${
                progressMessaging.badgeTone === "primary" ? "badge-primary" : "badge-warning"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                {progressMessaging.badgeTone === "primary" ? (
                  <path
                    fillRule="evenodd"
                    d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2V7a3 3 0 00-6 0v2h6z"
                    clipRule="evenodd"
                  />
                ) : (
                  <>
                    <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                    <path
                      fillRule="evenodd"
                      d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                      clipRule="evenodd"
                    />
                  </>
                )}
              </svg>
              {progressMessaging.badgeLabel}
            </span>
            <InfoTooltip text={progressMessaging.tooltip} position="bottom" />
          </div>
          {progressMessaging.detailLabel ? (
            <span
              className={`tabular-nums ${
                progressMessaging.detailTone === "success"
                  ? "text-success/80"
                  : progressMessaging.detailTone === "warning"
                    ? "text-warning"
                    : progressMessaging.detailTone === "primary"
                      ? "text-primary/80"
                      : "text-base-content/75"
              }`}
            >
              {progressMessaging.detailLabel}
            </span>
          ) : null}
        </div>
      ) : null}
      {statusPlacement === "afterProgress" ? statusRow : null}
      {showRevealedBreakdown ? (
        <div className="w-full">
          <RoundRevealedBreakdown
            snapshot={snapshot}
            stacked={!useCompactInlineRows && (stackForNarrowRail || alignLeft)}
          />
        </div>
      ) : null}
    </div>
  );
}

function LiveRoundActivity({
  snapshot,
  compact,
  condensed = false,
}: {
  snapshot: ReturnType<typeof useRoundSnapshot>;
  compact: boolean;
  condensed?: boolean;
}) {
  const { ratePercent, calculateBonus } = useParticipationRate();
  const progress = getRoundProgressMessaging(snapshot, ratePercent);
  const exampleBonus = calculateBonus(5);
  const blindDetail =
    exampleBonus != null
      ? `+${exampleBonus.toLocaleString(undefined, { maximumFractionDigits: 1 })} cREP bonus on 5 cREP`
      : "Blind-phase bonus loading";
  const detailCopy =
    snapshot.phase !== "voting"
      ? snapshot.hasRound
        ? `${formatCrepAmount(snapshot.totalStake, 0)} cREP locked in the last round`
        : "A new round forms with the next vote."
      : snapshot.isEpoch1
        ? condensed
          ? blindDetail
          : `Example bonus: ${blindDetail}.`
        : condensed
          ? (progress?.detailLabel ?? `${formatCrepAmount(snapshot.totalStake, 0)} cREP active`)
          : describeOpenRoundActivity(snapshot);
  const supportCopy =
    snapshot.phase !== "voting"
      ? "Check the round details below for the settled breakdown and history."
      : snapshot.isEpoch1
        ? "Votes stay hidden until reveal, so early signal stays private while keeping full weight."
        : "Revealed signal is live now. Open votes use informed weight, but they can still help close the round.";
  const condensedDetailCopy =
    progress?.detailLabel ??
    (snapshot.phase === "voting" && snapshot.voteCount >= snapshot.minVoters ? "Waiting for reveals" : detailCopy);
  const showsDedicatedProgressRow = Boolean(progress);

  if (condensed) {
    if (showsDedicatedProgressRow) {
      return null;
    }

    return (
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-base text-base-content/75">
        {progress ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getActivityToneClassName(progress.badgeTone)}`}
          >
            {progress.badgeLabel}
          </span>
        ) : null}
        <InfoTooltip text={progress?.tooltip ?? supportCopy} position="bottom" />
        <span className={`text-base tabular-nums ${getActivityDetailToneClassName(progress?.detailTone ?? "neutral")}`}>
          {condensedDetailCopy}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[1.3rem] bg-base-content/[0.04] ring-1 ring-base-content/8 ${
        condensed ? "px-2.5 py-2.5" : compact ? "px-3 py-3" : "px-3.5 py-3.5"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        {!condensed ? (
          <div>
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-base-content/52">
              Live round activity
            </p>
            {!showsDedicatedProgressRow ? (
              <p
                className={`mt-1 leading-relaxed text-base-content/70 ${
                  condensed ? "text-xs" : "text-sm"
                } ${compact ? "max-w-none" : "max-w-[18rem]"}`}
              >
                {detailCopy}
              </p>
            ) : null}
          </div>
        ) : null}
        {!showsDedicatedProgressRow ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {progress ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getActivityToneClassName(progress.badgeTone)}`}
              >
                {progress.badgeLabel}
              </span>
            ) : null}
            {!condensed && progress?.detailLabel ? (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${getActivityToneClassName(progress.detailTone)}`}
              >
                {progress.detailLabel}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={`grid grid-cols-3 ${condensed ? "mt-2.5 gap-1.5" : "mt-3 gap-2"}`}>
        <div className={`rounded-[1rem] bg-base-content/[0.04] ${condensed ? "px-2 py-1.5" : "px-3 py-2"}`}>
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-base-content/40">Committed</p>
          <p
            className={`font-semibold tabular-nums text-base-content ${condensed ? "mt-0.5 text-sm" : "mt-1 text-base"}`}
          >
            {snapshot.voteCount}
          </p>
        </div>
        <div className={`rounded-[1rem] bg-base-content/[0.04] ${condensed ? "px-2 py-1.5" : "px-3 py-2"}`}>
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-base-content/40">Revealed</p>
          <p
            className={`font-semibold tabular-nums text-base-content ${condensed ? "mt-0.5 text-sm" : "mt-1 text-base"}`}
          >
            {snapshot.revealedCount}
          </p>
        </div>
        <div className={`rounded-[1rem] bg-base-content/[0.04] ${condensed ? "px-2 py-1.5" : "px-3 py-2"}`}>
          <p className="text-[0.64rem] font-semibold uppercase tracking-[0.16em] text-base-content/40">Staked</p>
          <p
            className={`font-semibold tabular-nums text-base-content ${condensed ? "mt-0.5 text-sm" : "mt-1 text-base"}`}
          >
            {formatCrepAmount(snapshot.totalStake, 0)}
          </p>
        </div>
      </div>

      {!condensed ? <p className="mt-3 text-sm leading-relaxed text-base-content/56">{supportCopy}</p> : null}
    </div>
  );
}

/**
 * Displays the live rating signal and all voting controls in a separate card.
 */
export function VotingQuestionCard({
  contentId,
  categoryId,
  currentRating,
  onVote,
  isCommitting,
  address,
  error,
  cooldownSecondsRemaining = 0,
  isCooldownLoading = false,
  isOwnContent,
  openRound,
  embedded,
  compact = false,
  variant = "default",
  attentionToken,
}: VotingQuestionCardProps) {
  const isSignalVariant = variant === "signal";
  const isDockVariant = variant === "dock";
  const hideEmbeddedSignalSurface = Boolean(embedded && isSignalVariant);

  // Check if user already voted on this content in the current round
  const roundSnapshot = useRoundSnapshot(contentId, openRound ?? undefined);
  const { roundId, isRoundFull, phase, voteCount, minVoters } = roundSnapshot;
  const { filled: filledVoteIcons, empty: emptyVoteIcons } = computeVoteProgressIconCounts({ voteCount, minVoters });
  const cooldownActive = cooldownSecondsRemaining > 0;
  const cooldownCheckLoading = isCooldownLoading && !cooldownActive;
  const cooldownLabel = formatVoteCooldownRemaining(cooldownSecondsRemaining);
  const displayError =
    cooldownActive && error?.includes("You already voted on this content within the last") ? null : error;
  const [isDetailsOpen, setIsDetailsOpen] = useState(isSignalVariant);
  const [isAttentionActive, setIsAttentionActive] = useState(false);
  const detailsId = `voting-card-details-${contentId.toString()}`;

  // Check if user has committed to this round (direction hidden until reveal)
  // voterCommitHash(contentId, roundId, voter) returns bytes32 (0 = no commit)
  const { data: myCommitHash } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "voterCommitHash" as any,
    args: [contentId, roundId, address] as any,
    watch: true,
    query: { enabled: roundId > 0n && !!address },
  } as any);

  const hasMyVote =
    myCommitHash != null &&
    (myCommitHash as unknown as string) !== "0x0000000000000000000000000000000000000000000000000000000000000000";
  const usesDockStatusText = isDockVariant;
  const isDesktopSignalRailCard = compact && isSignalVariant;

  const centerStatusContent = address ? (
    hasMyVote ? (
      <HoverTooltip
        text="You voted, and your direction stays hidden until the blind phase ends. After that, eligible votes are normally revealed automatically, and you can self-reveal if needed."
        position="bottom"
      >
        {usesDockStatusText ? (
          <span className={DOCK_STATUS_TEXT_CLASS_NAME}>
            <span className="text-[0.95rem] font-semibold leading-none text-primary">Voted</span>
            <span className="text-[0.95rem] leading-none text-base-content/62">hidden</span>
          </span>
        ) : (
          <span className={STATUS_PILL_CLASS_NAME}>
            <span className="text-base font-semibold text-primary">Voted</span>
            <span className="text-base text-base-content/70">hidden</span>
          </span>
        )}
      </HoverTooltip>
    ) : isOwnContent ? (
      <HoverTooltip text="Content submitters cannot vote on their own submissions." position="bottom">
        {usesDockStatusText ? (
          <span
            className={`${DOCK_STATUS_TEXT_CLASS_NAME} max-w-[7.25rem] text-[0.95rem] leading-tight text-base-content/68`}
          >
            Your submission
          </span>
        ) : (
          <span className={STATUS_PILL_CLASS_NAME}>
            <span className="text-base text-base-content/65">Your submission</span>
          </span>
        )}
      </HoverTooltip>
    ) : cooldownActive ? (
      <HoverTooltip
        text={`You already voted on this content within the last 24 hours. Try again in ${cooldownLabel}.`}
        position="bottom"
      >
        {usesDockStatusText ? (
          <span className={DOCK_STATUS_TEXT_CLASS_NAME}>
            <span className="text-[0.95rem] font-medium leading-none text-base-content/75">Cooldown</span>
            <span className="text-[0.95rem] leading-none text-base-content/60">{cooldownLabel}</span>
          </span>
        ) : (
          <span className={STATUS_PILL_CLASS_NAME}>
            <span className="text-base font-medium text-base-content/75">Cooldown</span>
            <span className="text-base text-base-content/60">{cooldownLabel}</span>
          </span>
        )}
      </HoverTooltip>
    ) : cooldownCheckLoading ? (
      <HoverTooltip text="Checking your linked-wallet vote history before enabling this vote." position="bottom">
        {usesDockStatusText ? (
          <span className={DOCK_STATUS_TEXT_CLASS_NAME}>
            <span className="text-[0.95rem] font-medium leading-none text-base-content/75">Checking</span>
            <span className="text-[0.95rem] leading-none text-base-content/60">history</span>
          </span>
        ) : (
          <span className={STATUS_PILL_CLASS_NAME}>
            <span className="text-base font-medium text-base-content/75">Checking vote history</span>
          </span>
        )}
      </HoverTooltip>
    ) : isRoundFull ? (
      <HoverTooltip
        text="This round has reached the maximum number of voters. A new round will start after resolution."
        position="bottom"
      >
        {usesDockStatusText ? (
          <span className={`${DOCK_STATUS_TEXT_CLASS_NAME} text-[0.95rem] leading-tight text-base-content/68`}>
            Round full
          </span>
        ) : (
          <span className={STATUS_PILL_CLASS_NAME}>
            <span className="text-base text-base-content/65">Round full</span>
          </span>
        )}
      </HoverTooltip>
    ) : null
  ) : null;
  const orbSize = isDockVariant ? (compact ? 88 : 100) : isSignalVariant ? (compact ? 148 : 168) : compact ? 166 : 190;
  const shellClassName = compact ? "p-3 space-y-2.5" : "p-4 space-y-3 xl:p-3 xl:space-y-2.5 2xl:p-4 2xl:space-y-3";
  const headingRowClassName = compact ? "mb-2.5" : "mb-3";
  const actionStackClassName = compact ? "mt-2.5 gap-1.5" : "mt-3 gap-2";
  const footerStackClassName = compact ? "mt-2.5 gap-2" : "mt-3 gap-3 xl:mt-2.5 xl:gap-2.5 2xl:mt-3 2xl:gap-3";
  const activitySummary = <LiveRoundActivity snapshot={roundSnapshot} compact={compact} condensed />;
  const isLeftAlignedDockDetails = isDockVariant;
  const showInlineVotingSummary = phase === "voting" || roundSnapshot.round.revealedCount > 0;
  const { ratePercent } = useParticipationRate();
  const progressMessaging = getRoundProgressMessaging(roundSnapshot, ratePercent);
  const showInlineProgress = showInlineVotingSummary && Boolean(progressMessaging);
  const showInlineRevealedBreakdown = showInlineVotingSummary && roundSnapshot.round.revealedCount > 0;
  const inlineStatusContent =
    hasMyVote || (isDesktopSignalRailCard && cooldownActive) ? centerStatusContent : undefined;
  const inlineVotingSummary = (
    <InlineVotingSummary
      snapshot={roundSnapshot}
      filledVoteIcons={filledVoteIcons}
      emptyVoteIcons={emptyVoteIcons}
      compact={compact}
      stackForNarrowRail={isDesktopSignalRailCard}
      alignLeft={isLeftAlignedDockDetails}
      statusContent={inlineStatusContent}
      statusPlacement={inlineStatusContent ? "beforeProgress" : "afterProgress"}
    />
  );
  const showExpandedDetails = isSignalVariant || (isDetailsOpen && !isDockVariant);
  const inlineSummaryIncludesStatus = Boolean(inlineStatusContent) && showInlineVotingSummary;
  const showVoteAttentionHint = isAttentionActive && !centerStatusContent;

  useEffect(() => {
    setIsDetailsOpen(isSignalVariant);
  }, [contentId, isSignalVariant]);

  useEffect(() => {
    if (!attentionToken) return;

    setIsAttentionActive(false);
    const frameId = window.requestAnimationFrame(() => setIsAttentionActive(true));
    const timeoutId = window.setTimeout(() => setIsAttentionActive(false), 1100);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [attentionToken]);

  if (isDockVariant) {
    const dockVoteDisabled = isCommitting || Boolean(centerStatusContent);
    const dockNotchRadius = compact ? 58 : 66;
    const dockNotchCutout = compact ? 52 : 60;
    const dockWrapperTopPaddingClassName = compact ? (isDetailsOpen ? "pt-8" : "pt-10") : "pt-14";
    const dockControlsPaddingClassName = compact ? "px-4 pb-2.5 pt-4" : "px-4 pb-3 pt-7";
    const dockMoreClassName = "text-base font-medium text-base-content/68 hover:text-base-content/88";
    const dockVoteSpacerClassName = "h-11 w-11";
    const dockShellMaskStyle = {
      WebkitMaskImage: `radial-gradient(circle ${dockNotchRadius}px at 50% 0, transparent 0 ${dockNotchCutout}px, black ${dockNotchCutout + 1}px)`,
      maskImage: `radial-gradient(circle ${dockNotchRadius}px at 50% 0, transparent 0 ${dockNotchCutout}px, black ${dockNotchCutout + 1}px)`,
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
    };
    const dockSurfaceStyle = {
      background: compact ? "var(--curyo-surface)" : VOTING_SURFACE_BACKGROUND,
    };
    const dockContentStyle = compact ? { paddingBottom: "env(safe-area-inset-bottom)" } : undefined;
    const dockShellClassName = compact ? "rounded-none" : "rounded-[2rem]";
    const dockShellBorderClassName = compact ? "" : "ring-1 ring-base-content/8";
    const dockTopBorderArcRadius = dockNotchCutout;
    const dockTopBorderOverlayStyle = compact
      ? {
          height: `${dockTopBorderArcRadius + 2}px`,
        }
      : undefined;
    const dockTopBorderSegmentStyle = compact
      ? {
          width: `calc(50% - ${dockTopBorderArcRadius}px)`,
          borderColor: "var(--curyo-shell-border-strong)",
        }
      : undefined;
    const dockTopBorderArcStyle = compact
      ? {
          top: `${-dockTopBorderArcRadius}px`,
          width: `${dockTopBorderArcRadius * 2}px`,
          height: `${dockTopBorderArcRadius * 2}px`,
          borderColor: "var(--curyo-shell-border-strong)",
        }
      : undefined;
    const mobileOrbClassName = compact ? "drop-shadow-[0_14px_28px_rgba(9,10,12,0.7)]" : "";

    return (
      <div
        className={`relative ${embedded ? "" : "rounded-2xl"} flex min-h-0 flex-col transition-[padding-top] duration-200 ease-out ${dockWrapperTopPaddingClassName}`}
      >
        {compact ? (
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-full bg-[rgba(9,10,12,0.46)] blur-[12px]"
            style={{ width: `${orbSize * 0.84}px`, height: `${orbSize * 0.84}px` }}
          />
        ) : null}
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2">
          <RatingOrb rating={currentRating} size={orbSize} showGlow={compact} className={mobileOrbClassName} />
        </div>

        <div className="relative z-10">
          {dockTopBorderOverlayStyle ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-10 overflow-hidden"
              style={dockTopBorderOverlayStyle}
            >
              <div className="absolute left-0 top-0 border-t" style={dockTopBorderSegmentStyle} />
              <div className="absolute right-0 top-0 border-t" style={dockTopBorderSegmentStyle} />
              <div className="absolute left-1/2 -translate-x-1/2 rounded-full border" style={dockTopBorderArcStyle} />
            </div>
          ) : null}
          <div
            className={`relative overflow-hidden shadow-[0_16px_36px_rgb(0_0_0_/_0.28)] ${
              isAttentionActive ? "vote-surface-attention" : ""
            } ${dockShellClassName} ${dockShellBorderClassName}`}
            data-vote-attention={isAttentionActive ? "true" : undefined}
            style={{ ...dockShellMaskStyle, ...dockSurfaceStyle }}
          >
            <div style={dockContentStyle}>
              <div className={dockControlsPaddingClassName}>
                {!centerStatusContent ? (
                  <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-end gap-3">
                    <div className="justify-self-start">
                      <CuryoVoteButton
                        direction="up"
                        size="sm"
                        onClick={() => onVote(true)}
                        disabled={dockVoteDisabled}
                        attention={isAttentionActive && !dockVoteDisabled}
                        tooltipPosition="top"
                      />
                    </div>
                    <div className="justify-self-end translate-y-1">
                      <MoreToggleButton
                        expanded={isDetailsOpen}
                        onClick={() => setIsDetailsOpen(current => !current)}
                        controlsId={detailsId}
                        className={dockMoreClassName}
                      />
                    </div>
                    <div className="justify-self-end">
                      <CuryoVoteButton
                        direction="down"
                        size="sm"
                        onClick={() => onVote(false)}
                        disabled={dockVoteDisabled}
                        attention={isAttentionActive && !dockVoteDisabled}
                        tooltipPosition="top"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                    <div className="min-w-0 justify-self-start [&>button]:max-w-full">{centerStatusContent}</div>
                    <div className="self-center">
                      <MoreToggleButton
                        expanded={isDetailsOpen}
                        onClick={() => setIsDetailsOpen(current => !current)}
                        controlsId={detailsId}
                        className={dockMoreClassName}
                      />
                    </div>
                    <div aria-hidden className={`${dockVoteSpacerClassName} justify-self-end`} />
                  </div>
                )}
              </div>

              {showVoteAttentionHint ? (
                <p className="vote-attention-hint px-4 pb-1 text-center text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-primary/90">
                  Rate this content here
                </p>
              ) : null}

              {displayError ? <p className="px-4 pb-1 text-center text-sm text-error">{displayError}</p> : null}

              {isDetailsOpen ? (
                <div id={detailsId} className="relative z-10 pb-3 pt-1">
                  <div aria-hidden="true" className="mx-4 mb-3 h-px bg-[color:var(--curyo-shell-border-strong)]" />
                  <div className="px-4">
                    <div className="max-h-[34svh] overflow-y-auto [scrollbar-gutter:stable]">
                      <div className="flex flex-col gap-2.5 pb-1">
                        {showInlineVotingSummary ? inlineVotingSummary : null}
                        {activitySummary}
                        {!showInlineProgress ? <RoundProgress snapshot={roundSnapshot} /> : null}
                        {!showInlineRevealedBreakdown ? <RoundRevealedBreakdown snapshot={roundSnapshot} /> : null}
                        <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
                        <RatingHistory
                          contentId={contentId}
                          variant={embedded ? "dark" : "default"}
                          fallbackRating={currentRating}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${embedded ? "" : "rounded-2xl"} flex h-full min-h-0 flex-col overflow-hidden ${
        isAttentionActive ? "vote-surface-attention" : ""
      } ${shellClassName}`}
      data-vote-attention={isAttentionActive ? "true" : undefined}
      style={embedded ? {} : { background: "var(--curyo-surface-elevated)" }}
    >
      {!hideEmbeddedSignalSurface ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,153,104,0.18),transparent_34%),radial-gradient(circle_at_50%_58%,rgba(255,241,216,0.08),transparent_40%)]"
        />
      ) : null}
      {/* Content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col items-center text-center">
          <div
            className={`${headingRowClassName} flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-base-content/65`}
          >
            <span>Community rating</span>
            <InfoTooltip text={RATING_GUIDANCE_TEXT} position="bottom" />
          </div>
          <RatingOrb rating={currentRating} size={orbSize} />
          {showVoteAttentionHint && isSignalVariant ? (
            <p className="vote-attention-hint mt-3 text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-primary/90">
              Rate this content here
            </p>
          ) : null}
          {!(address && hasMyVote) && !centerStatusContent && isSignalVariant ? (
            <div className="mt-3 flex items-center justify-center gap-3">
              <CuryoVoteButton
                direction="up"
                onClick={() => onVote(true)}
                disabled={isCommitting}
                attention={isAttentionActive && !isCommitting}
              />
              <CuryoVoteButton
                direction="down"
                onClick={() => onVote(false)}
                disabled={isCommitting}
                attention={isAttentionActive && !isCommitting}
              />
            </div>
          ) : null}
          <div className={`flex w-full shrink-0 flex-col items-center ${actionStackClassName}`}>
            {phase === "voting" || hasMyVote ? (
              <div className="flex w-full flex-col items-center gap-2">
                {showInlineVotingSummary ? inlineVotingSummary : null}
                {!inlineSummaryIncludesStatus ? centerStatusContent : null}
              </div>
            ) : centerStatusContent ? (
              centerStatusContent
            ) : null}

            {/* Vote error message */}
            {displayError && <p className="text-center text-base text-error">{displayError}</p>}

            {/* Voting arrows - centered below the rating stack */}
            {!(address && hasMyVote) && !centerStatusContent && !isSignalVariant && !isDockVariant && (
              <div className="flex shrink-0 items-center justify-center gap-2 lg:gap-3">
                {address ? (
                  <>
                    <CuryoVoteButton
                      direction="up"
                      onClick={() => onVote(true)}
                      disabled={isCommitting}
                      attention={isAttentionActive && !isCommitting}
                    />
                    <CuryoVoteButton
                      direction="down"
                      onClick={() => onVote(false)}
                      disabled={isCommitting}
                      attention={isAttentionActive && !isCommitting}
                    />
                  </>
                ) : (
                  <CuryoConnectButton />
                )}
              </div>
            )}
          </div>
        </div>

        <div className={`flex shrink-0 flex-col ${footerStackClassName}`}>
          {!isSignalVariant ? <LiveRoundActivity snapshot={roundSnapshot} compact={compact} condensed={false} /> : null}
          {!isSignalVariant && !showInlineProgress ? <RoundProgress snapshot={roundSnapshot} /> : null}
          {!isSignalVariant ? (
            <div className={compact ? "pt-0.5" : "pt-1"}>
              <MoreToggleButton
                expanded={isDetailsOpen}
                onClick={() => setIsDetailsOpen(current => !current)}
                controlsId={detailsId}
              />
            </div>
          ) : null}
          {showExpandedDetails ? (
            <div id={detailsId} className={`flex flex-col ${compact ? "gap-2.5" : "gap-3"}`}>
              {!isSignalVariant && !showInlineRevealedBreakdown ? (
                <RoundRevealedBreakdown snapshot={roundSnapshot} stacked={isDesktopSignalRailCard} />
              ) : null}
              <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
              <RatingHistory
                contentId={contentId}
                variant={embedded || isSignalVariant ? "dark" : "default"}
                fallbackRating={currentRating}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
