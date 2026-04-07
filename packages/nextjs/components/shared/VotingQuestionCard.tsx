"use client";

import { useEffect, useState } from "react";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { CuryoVoteButton, VoteDirectionIcon } from "~~/components/shared/CuryoVoteButton";
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
import { formatCrepAmount, getRoundProgressMessaging } from "~~/lib/vote/voteIncentives";
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
          : `${formatCrepAmount(snapshot.totalStake, 0)} cREP active · ${snapshot.votersNeeded > 0 ? `${snapshot.votersNeeded} more vote${snapshot.votersNeeded === 1 ? "" : "s"} to settle.` : "Settlement threshold is in reach."}`;
  const supportCopy =
    snapshot.phase !== "voting"
      ? "Check the round details below for the settled breakdown and history."
      : snapshot.isEpoch1
        ? "Votes stay hidden until reveal, so early signal stays private while keeping full weight."
        : "Revealed signal is live now. Open votes use informed weight, but they can still help close the round.";

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
            <p
              className={`mt-1 leading-relaxed text-base-content/70 ${
                condensed ? "text-xs" : "text-sm"
              } ${compact ? "max-w-none" : "max-w-[18rem]"}`}
            >
              {detailCopy}
            </p>
          </div>
        ) : null}
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

function DockVoteAction({
  label,
  direction,
  disabled,
  onClick,
}: {
  label: string;
  direction: "up" | "down";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-0 items-center justify-center gap-1.5 rounded-full bg-base-100/80 px-3 py-1.5 text-xs font-semibold text-base-content transition-colors hover:bg-base-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <VoteDirectionIcon direction={direction} className="h-3.5 w-3.5 stroke-[2.4]" />
      <span>{label}</span>
    </button>
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
  const orbSize = isDockVariant ? (compact ? 88 : 100) : isSignalVariant ? (compact ? 112 : 136) : compact ? 166 : 190;
  const shellClassName = compact ? "p-3 space-y-2.5" : "p-4 space-y-3 xl:p-3 xl:space-y-2.5 2xl:p-4 2xl:space-y-3";
  const headingRowClassName = compact ? "mb-2.5" : "mb-3";
  const actionStackClassName = compact ? "mt-2.5 gap-1.5" : "mt-3 gap-2";
  const footerStackClassName = compact ? "mt-2.5 gap-2" : "mt-3 gap-3 xl:mt-2.5 xl:gap-2.5 2xl:mt-3 2xl:gap-3";

  useEffect(() => {
    setIsDetailsOpen(isSignalVariant);
  }, [contentId, isSignalVariant]);

  if (isDockVariant) {
    const dockBadgeLabel = phase === "voting" ? "Live" : roundSnapshot.hasRound ? "Settled" : "Starting";
    const dockSummary =
      phase === "voting"
        ? roundSnapshot.votersNeeded > 0
          ? `${roundSnapshot.votersNeeded} more vote${roundSnapshot.votersNeeded === 1 ? "" : "s"}`
          : "Settlement in reach"
        : roundSnapshot.hasRound
          ? `${formatCrepAmount(roundSnapshot.totalStake, 0)} cREP settled`
          : "Next round on first vote";

    return (
      <div
        className={`relative ${embedded ? "" : "rounded-2xl"} flex min-h-0 flex-col overflow-hidden ${compact ? "p-3" : "p-4"}`}
        style={embedded ? {} : { background: "var(--curyo-surface-elevated)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,153,104,0.12),transparent_28%),radial-gradient(circle_at_78%_88%,rgba(255,241,216,0.06),transparent_34%)]"
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="shrink-0">
            <RatingOrb rating={currentRating} size={orbSize} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-base-content/[0.06] px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-base-content/72">
                {dockBadgeLabel}
              </span>
              <span className="rounded-full bg-base-content/[0.06] px-2.5 py-1 text-xs font-medium text-base-content/72">
                {dockSummary}
              </span>
            </div>

            {(phase === "voting" || hasMyVote) && !centerStatusContent ? (
              <div className="mt-2 flex items-center gap-2 text-xs text-base-content/58">
                <span>{voteCount} committed</span>
                <span>{revealedCount} revealed</span>
              </div>
            ) : null}

            {displayError ? <p className="mt-2 text-sm text-error">{displayError}</p> : null}
          </div>

          <div className="shrink-0">
            {!(address && hasMyVote) && !centerStatusContent ? (
              <div className="flex flex-col items-center gap-2">
                <DockVoteAction
                  label="Score too low"
                  direction="up"
                  disabled={isCommitting}
                  onClick={() => onVote(true)}
                />
                <DockVoteAction
                  label="Score too high"
                  direction="down"
                  disabled={isCommitting}
                  onClick={() => onVote(false)}
                />
              </div>
            ) : centerStatusContent ? (
              centerStatusContent
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative ${embedded ? "" : "rounded-2xl"} flex h-full min-h-0 flex-col overflow-hidden ${shellClassName}`}
      style={embedded ? {} : { background: "var(--curyo-surface-elevated)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,153,104,0.18),transparent_34%),radial-gradient(circle_at_50%_58%,rgba(255,241,216,0.08),transparent_40%)]"
      />
      {/* Content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 flex-col items-center text-center">
          <div
            className={`${headingRowClassName} flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-base-content/65`}
          >
            <span>Community rating</span>
            <InfoTooltip text={RATING_GUIDANCE_TEXT} position="bottom" />
          </div>
          {!(address && hasMyVote) && !centerStatusContent && isSignalVariant ? (
            <div className="mb-2">
              <CuryoVoteButton direction="up" onClick={() => onVote(true)} disabled={isCommitting} />
            </div>
          ) : null}
          <RatingOrb rating={currentRating} size={orbSize} />
          {!(address && hasMyVote) && !centerStatusContent && isSignalVariant ? (
            <div className="mt-2">
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
          <LiveRoundActivity snapshot={roundSnapshot} compact={compact} condensed={isSignalVariant} />
          {!isSignalVariant ? <RoundProgress snapshot={roundSnapshot} /> : null}
          {!isDockVariant ? (
            <div className={compact ? "pt-0.5" : "pt-1"}>
              <MoreToggleButton
                expanded={isDetailsOpen}
                onClick={() => setIsDetailsOpen(current => !current)}
                controlsId={detailsId}
              />
            </div>
          ) : null}
          {isDetailsOpen && !isDockVariant ? (
            <div id={detailsId} className={`flex flex-col ${compact ? "gap-2.5" : "gap-3"}`}>
              {!isSignalVariant ? <RoundRevealedBreakdown snapshot={roundSnapshot} /> : null}
              <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
              <RatingHistory contentId={contentId} variant={embedded || isSignalVariant ? "dark" : "default"} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
