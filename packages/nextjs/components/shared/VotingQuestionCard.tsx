"use client";

import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { CuryoVoteButton } from "~~/components/shared/CuryoVoteButton";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RatingOrb } from "~~/components/shared/RatingOrb";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundStats } from "~~/components/shared/RoundStats";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import { formatVoteCooldownRemaining } from "~~/lib/vote/cooldown";
import { computeVoteProgressIconCounts } from "~~/lib/vote/voteProgressIcons";

interface VotingQuestionCardProps {
  contentId: bigint;
  categoryId: bigint;
  title?: string;
  onVote: (isUp: boolean) => void;
  isCommitting: boolean;
  address?: string;
  error?: string | null;
  cooldownSecondsRemaining?: number;
  isOwnContent?: boolean;
  /** When true, removes card background/rounding (parent provides it). */
  embedded?: boolean;
}

const RATING_GUIDANCE_TEXT =
  "Rate this content against its current community score. Vote up when it deserves a higher rating and vote down when it deserves a lower one. Always vote down illegal, broken, or misdescribed content.";

/**
 * Displays the live rating signal and all voting controls in a separate card.
 */
export function VotingQuestionCard({
  contentId,
  categoryId,
  onVote,
  isCommitting,
  address,
  error,
  cooldownSecondsRemaining = 0,
  isOwnContent,
  embedded,
}: VotingQuestionCardProps) {
  const { data: currentRating } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "getRating",
    args: [contentId],
  });

  const currentRatingValue = currentRating ? Number(currentRating) : 50;

  // Check if user already voted on this content in the current round
  const roundSnapshot = useRoundSnapshot(contentId);
  const { roundId, isRoundFull, phase, voteCount, revealedCount, minVoters } = roundSnapshot;
  const pendingRevealCount = Math.max(0, voteCount - revealedCount);
  const { filled: filledVoteIcons, empty: emptyVoteIcons } = computeVoteProgressIconCounts({ voteCount, minVoters });
  const cooldownActive = cooldownSecondsRemaining > 0;
  const cooldownLabel = formatVoteCooldownRemaining(cooldownSecondsRemaining);
  const displayError =
    cooldownActive && error?.includes("You already voted on this content within the last") ? null : error;

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

  return (
    <div
      className={`relative ${embedded ? "" : "rounded-2xl"} flex h-full min-h-0 flex-col overflow-hidden p-4 space-y-3 xl:p-3 xl:space-y-2.5 2xl:p-4 2xl:space-y-3`}
      style={embedded ? {} : { background: "var(--curyo-surface-elevated)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_14%,rgba(255,153,104,0.18),transparent_34%),radial-gradient(circle_at_50%_58%,rgba(255,241,216,0.08),transparent_40%)]"
      />
      {/* Content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="mb-4 flex shrink-0 flex-col items-center text-center">
          <div className="mb-3 flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-base-content/45">
            <span>Community rating</span>
            <InfoTooltip text={RATING_GUIDANCE_TEXT} position="bottom" />
          </div>
          <RatingOrb rating={currentRatingValue} size={190} />
        </div>

        {/* Committed voter icons */}
        {(phase === "voting" || hasMyVote) && (
          <div className="mb-2 flex shrink-0 flex-col items-center gap-2">
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
                      className="h-3.5 w-3.5 text-base-content/20"
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

            {hasMyVote && (
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
                data-tip="Your vote is encrypted until the blind phase ends. The keeper normally reveals eligible votes afterward, and you can self-reveal if needed."
              >
                <span className="text-base font-semibold text-primary">Committed</span>
                <span className="text-base text-base-content/50">hidden</span>
              </div>
            )}
          </div>
        )}

        <div className="mb-1.5 flex shrink-0 justify-start">
          <RoundProgress snapshot={roundSnapshot} />
        </div>

        <div className="mb-3 flex shrink-0 justify-start">
          <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
        </div>

        {/* Vote error message */}
        {displayError && <p className="mb-2 text-center text-base text-error">{displayError}</p>}

        {/* Voting arrows - centered below question */}
        {!(address && hasMyVote) && (
          <div className="mb-3 flex shrink-0 items-center justify-center gap-2 lg:gap-3">
            {address ? (
              isOwnContent ? (
                <div
                  className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
                  data-tip="Content submitters cannot vote on their own submissions."
                >
                  <span className="text-base text-base-content/40">Your submission</span>
                </div>
              ) : cooldownActive ? (
                <div
                  className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
                  data-tip={`You already voted on this content within the last 24 hours. Try again in ${cooldownLabel}.`}
                >
                  <span className="text-base font-medium text-base-content/55">Cooldown</span>
                  <span className="text-base text-base-content/35">{cooldownLabel}</span>
                </div>
              ) : isRoundFull ? (
                <div
                  className="tooltip tooltip-bottom cursor-help flex items-center gap-2 rounded-full border border-base-content/10 bg-base-content/5 px-4 py-2"
                  data-tip="This round has reached the maximum number of voters. A new round will start after resolution."
                >
                  <span className="text-base text-base-content/40">Round full</span>
                </div>
              ) : (
                <>
                  <CuryoVoteButton direction="down" onClick={() => onVote(false)} disabled={isCommitting} />
                  <CuryoVoteButton direction="up" onClick={() => onVote(true)} disabled={isCommitting} />
                </>
              )
            ) : (
              <RainbowKitCustomConnectButton />
            )}
          </div>
        )}

        {/* Rating history chart */}
        <div className="mt-auto shrink-0 pt-1.5 xl:pt-1">
          <RatingHistory contentId={contentId} />
        </div>
      </div>
    </div>
  );
}
