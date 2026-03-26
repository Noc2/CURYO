"use client";

import { useEffect, useState } from "react";
import { CuryoConnectButton } from "~~/components/scaffold-eth";
import { CuryoVoteButton } from "~~/components/shared/CuryoVoteButton";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RatingOrb } from "~~/components/shared/RatingOrb";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundRevealedBreakdown, RoundStats } from "~~/components/shared/RoundStats";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import type { ContentOpenRoundSummary } from "~~/hooks/contentFeed/shared";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import { formatVoteCooldownRemaining } from "~~/lib/vote/cooldown";
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
}

const RATING_GUIDANCE_TEXT =
  "The community score runs from 0.0 to 10.0. Vote up when content deserves a higher score and vote down when it deserves a lower one. Always vote down illegal, broken, or misdescribed content.";

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
}: VotingQuestionCardProps) {
  // Check if user already voted on this content in the current round
  const roundSnapshot = useRoundSnapshot(contentId, openRound ?? undefined);
  const { roundId, isRoundFull, phase, voteCount, revealedCount, minVoters } = roundSnapshot;
  const pendingRevealCount = Math.max(0, voteCount - revealedCount);
  const { filled: filledVoteIcons, empty: emptyVoteIcons } = computeVoteProgressIconCounts({ voteCount, minVoters });
  const cooldownActive = cooldownSecondsRemaining > 0;
  const cooldownLabel = formatVoteCooldownRemaining(cooldownSecondsRemaining);
  const displayError =
    cooldownActive && error?.includes("You already voted on this content within the last") ? null : error;
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

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
        data-tip="Your vote is encrypted until the blind phase ends. The keeper normally reveals eligible votes afterward, and you can self-reveal if needed."
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

  const orbSize = compact ? 166 : 190;
  const shellClassName = compact ? "p-3 space-y-2.5" : "p-4 space-y-3 xl:p-3 xl:space-y-2.5 2xl:p-4 2xl:space-y-3";
  const headingRowClassName = compact ? "mb-2.5" : "mb-3";
  const actionStackClassName = compact ? "mt-2.5 gap-1.5" : "mt-3 gap-2";
  const footerStackClassName = compact ? "mt-2.5 gap-2" : "mt-3 gap-3 xl:mt-2.5 xl:gap-2.5 2xl:mt-3 2xl:gap-3";

  useEffect(() => {
    setIsHistoryOpen(false);
  }, [contentId]);

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
          <RatingOrb rating={currentRating} size={orbSize} />
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
            {!(address && hasMyVote) && !centerStatusContent && (
              <div className="flex shrink-0 items-center justify-center gap-2 lg:gap-3">
                {address ? (
                  <>
                    <CuryoVoteButton direction="down" onClick={() => onVote(false)} disabled={isCommitting} />
                    <CuryoVoteButton direction="up" onClick={() => onVote(true)} disabled={isCommitting} />
                  </>
                ) : (
                  <CuryoConnectButton />
                )}
              </div>
            )}

            <div className={`${compact ? "mt-1.5" : "mt-2"} flex w-full shrink-0`}>
              <RoundRevealedBreakdown snapshot={roundSnapshot} />
            </div>
          </div>
        </div>

        <div className={`flex shrink-0 flex-col ${footerStackClassName}`}>
          <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
          <RoundProgress snapshot={roundSnapshot} />
          {embedded ? (
            <div className={`${compact ? "pt-0.5" : "pt-1"} flex flex-col items-start gap-2`}>
              <button
                type="button"
                onClick={() => setIsHistoryOpen(current => !current)}
                aria-expanded={isHistoryOpen}
                aria-controls={`rating-history-${contentId.toString()}`}
                className="text-sm text-base-content/60 underline decoration-base-content/15 underline-offset-4 transition-colors hover:text-base-content/80 focus-visible:outline-none focus-visible:text-base-content"
              >
                {isHistoryOpen ? "Hide history" : "Show history"}
              </button>
              {isHistoryOpen ? (
                <div id={`rating-history-${contentId.toString()}`} className="w-full">
                  <RatingHistory contentId={contentId} showHeader={false} />
                </div>
              ) : null}
            </div>
          ) : (
            <RatingHistory contentId={contentId} />
          )}
        </div>
      </div>
    </div>
  );
}
