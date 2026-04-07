"use client";

import { useEffect, useState } from "react";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { CuryoVoteButton } from "~~/components/shared/CuryoVoteButton";
import { MoreToggleButton } from "~~/components/shared/MoreToggleButton";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RatingOrb } from "~~/components/shared/RatingOrb";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundRevealedBreakdown, RoundStats } from "~~/components/shared/RoundStats";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
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
  isOwnContent?: boolean;
  openRound?: ContentOpenRoundSummary | null;
  /** When true, removes card background/rounding (parent provides it). */
  embedded?: boolean;
  compact?: boolean;
  variant?: "default" | "signal" | "dock";
}

const RATING_GUIDANCE_TEXT =
  "The community score runs from 0.0 to 10.0, where higher means better. Vote up when content deserves a better score and vote down when it deserves a worse one. Always vote down illegal, broken, or misdescribed content.";
export const VOTING_SURFACE_BACKGROUND =
  "radial-gradient(circle at 50% 12%, rgb(121 88 68) 0%, rgb(103 74 61) 18%, rgb(79 58 57) 36%, rgb(53 41 46) 56%, rgb(35 30 35) 78%, rgb(23 22 26) 100%), linear-gradient(180deg, rgb(92 67 57) 0%, rgb(61 47 50) 30%, rgb(38 31 36) 62%, rgb(23 22 26) 100%)";

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
  isOwnContent,
  openRound,
  embedded,
  compact = false,
  variant = "default",
}: VotingQuestionCardProps) {
  const isSignalVariant = variant === "signal";
  const isDockVariant = variant === "dock";
  const hideEmbeddedSignalSurface = Boolean(embedded && isSignalVariant);

  // Check if user already voted on this content in the current round
  const roundSnapshot = useRoundSnapshot(contentId, openRound ?? undefined);
  const { roundId, isRoundFull, phase, voteCount, revealedCount, minVoters } = roundSnapshot;
  const pendingRevealCount = Math.max(0, voteCount - revealedCount);
  const { filled: filledVoteIcons, empty: emptyVoteIcons } = computeVoteProgressIconCounts({ voteCount, minVoters });
  const cooldownActive = cooldownSecondsRemaining > 0;
  const cooldownLabel = formatVoteCooldownRemaining(cooldownSecondsRemaining);
  const displayError =
    cooldownActive && error?.includes("You already voted on this content within the last") ? null : error;
  const [isDetailsOpen, setIsDetailsOpen] = useState(isSignalVariant);
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

  const centerStatusContent = address ? (
    hasMyVote ? (
      <div
        className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
        data-tip="Your vote is encrypted until the blind phase ends. The keeper normally validates the stored tlock stanza and reveals eligible votes afterward, and you can self-reveal if needed."
      >
        <span className="text-base font-semibold text-primary">Committed</span>
        <span className="text-base text-base-content/70">hidden</span>
      </div>
    ) : isOwnContent ? (
      <div
        className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
        data-tip="Content submitters cannot vote on their own submissions."
      >
        <span className="text-base text-base-content/65">Your submission</span>
      </div>
    ) : cooldownActive ? (
      <div
        className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
        data-tip={`You already voted on this content within the last 24 hours. Try again in ${cooldownLabel}.`}
      >
        <span className="text-base font-medium text-base-content/75">Cooldown</span>
        <span className="text-base text-base-content/60">{cooldownLabel}</span>
      </div>
    ) : isRoundFull ? (
      <div
        className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
        data-tip="This round has reached the maximum number of voters. A new round will start after resolution."
      >
        <span className="text-base text-base-content/65">Round full</span>
      </div>
    ) : null
  ) : null;
  const orbSize = isDockVariant ? (compact ? 88 : 100) : isSignalVariant ? (compact ? 148 : 168) : compact ? 166 : 190;
  const shellClassName = compact ? "p-3 space-y-2.5" : "p-4 space-y-3 xl:p-3 xl:space-y-2.5 2xl:p-4 2xl:space-y-3";
  const headingRowClassName = compact ? "mb-2.5" : "mb-3";
  const actionStackClassName = compact ? "mt-2.5 gap-1.5" : "mt-3 gap-2";
  const footerStackClassName = compact ? "mt-2.5 gap-2" : "mt-3 gap-3 xl:mt-2.5 xl:gap-2.5 2xl:mt-3 2xl:gap-3";
  const activitySummary = <LiveRoundActivity snapshot={roundSnapshot} compact={compact} condensed />;
  const showExpandedDetails = isSignalVariant || (isDetailsOpen && !isDockVariant);

  useEffect(() => {
    setIsDetailsOpen(isSignalVariant);
  }, [contentId, isSignalVariant]);

  if (isDockVariant) {
    const dockVoteDisabled = isCommitting || Boolean(centerStatusContent);
    const dockNotchRadius = compact ? 58 : 66;
    const dockNotchCutout = compact ? 52 : 60;
    const dockControlsPaddingClassName = compact ? "px-4 pb-2.5 pt-4" : "px-4 pb-3 pt-7";
    const dockMoreClassName = "text-base font-medium text-base-content/68 hover:text-base-content/88";
    const dockShellMaskStyle = {
      WebkitMaskImage: `radial-gradient(circle ${dockNotchRadius}px at 50% 0, transparent 0 ${dockNotchCutout}px, black ${dockNotchCutout + 1}px)`,
      maskImage: `radial-gradient(circle ${dockNotchRadius}px at 50% 0, transparent 0 ${dockNotchCutout}px, black ${dockNotchCutout + 1}px)`,
      WebkitMaskRepeat: "no-repeat",
      maskRepeat: "no-repeat",
    };
    const dockSurfaceStyle = {
      backgroundColor: "rgb(23 22 26)",
      backgroundImage: VOTING_SURFACE_BACKGROUND,
    };

    return (
      <div className={`relative ${embedded ? "" : "rounded-2xl"} flex min-h-0 flex-col ${compact ? "pt-10" : "pt-14"}`}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 rounded-[2rem] ring-1 ring-base-content/8"
          style={dockSurfaceStyle}
        />
        <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2">
          <RatingOrb rating={currentRating} size={orbSize} showGlow={false} />
        </div>

        <div
          className="relative z-10 overflow-hidden rounded-[2rem] ring-1 ring-base-content/8 shadow-[0_16px_36px_rgb(0_0_0_/_0.28)]"
          style={{ ...dockShellMaskStyle, ...dockSurfaceStyle }}
        >
          <div className={dockControlsPaddingClassName}>
            {!centerStatusContent ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div className="justify-self-start">
                  <CuryoVoteButton direction="up" size="sm" onClick={() => onVote(true)} disabled={dockVoteDisabled} />
                </div>
                <div className="justify-self-center pb-1">
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
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="flex items-center justify-center">{centerStatusContent}</div>
                <MoreToggleButton
                  expanded={isDetailsOpen}
                  onClick={() => setIsDetailsOpen(current => !current)}
                  controlsId={detailsId}
                  className={dockMoreClassName}
                />
              </div>
            )}
          </div>

          {displayError ? <p className="px-4 pb-1 text-center text-sm text-error">{displayError}</p> : null}

          {isDetailsOpen ? (
            <div id={detailsId} className="relative z-10 px-4 pb-3 pt-1">
              <div className="max-h-[34svh] overflow-y-auto [scrollbar-gutter:stable]">
                <div className="flex flex-col gap-2.5 pb-1">
                  {activitySummary}
                  <RoundProgress snapshot={roundSnapshot} />
                  <RoundRevealedBreakdown snapshot={roundSnapshot} />
                  <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
                  <RatingHistory
                    contentId={contentId}
                    variant={embedded ? "dark" : "default"}
                    fallbackRating={currentRating}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${embedded ? "" : "rounded-2xl"} flex h-full min-h-0 flex-col overflow-hidden ${shellClassName}`}
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
          {!(address && hasMyVote) && !centerStatusContent && isSignalVariant ? (
            <div className="mt-3 flex items-center justify-center gap-3">
              <CuryoVoteButton direction="up" onClick={() => onVote(true)} disabled={isCommitting} />
              <CuryoVoteButton direction="down" onClick={() => onVote(false)} disabled={isCommitting} />
            </div>
          ) : null}
          <div className={`flex w-full shrink-0 flex-col items-center ${actionStackClassName}`}>
            {phase === "voting" || hasMyVote ? (
              <div className="flex flex-col items-center gap-2">
                {phase === "voting" && (
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
                          <path
                            fillRule="evenodd"
                            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                            clipRule="evenodd"
                          />
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
                          <path
                            fillRule="evenodd"
                            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ))}
                    </span>
                    <InfoTooltip
                      text={`${voteCount} vote${voteCount === 1 ? "" : "s"} committed in this round. ${revealedCount} revealed.${pendingRevealCount > 0 ? ` ${pendingRevealCount} commit${pendingRevealCount === 1 ? "" : "s"} still pending reveal.` : ""} ${Math.max(0, minVoters - revealedCount) > 0 ? `${Math.max(0, minVoters - revealedCount)} more revealed vote${Math.max(0, minVoters - revealedCount) === 1 ? "" : "s"} needed before settlement can start.` : "Threshold reached. Settlement follows once past-epoch reveal checks clear."}`}
                      position="bottom"
                    />
                  </span>
                )}

                {centerStatusContent}
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
                    <CuryoVoteButton direction="up" onClick={() => onVote(true)} disabled={isCommitting} />
                    <CuryoVoteButton direction="down" onClick={() => onVote(false)} disabled={isCommitting} />
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
          {!isSignalVariant ? <RoundProgress snapshot={roundSnapshot} /> : null}
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
              {!isSignalVariant ? <RoundRevealedBreakdown snapshot={roundSnapshot} /> : null}
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
