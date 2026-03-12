"use client";

import { useMemo } from "react";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundStats } from "~~/components/shared/RoundStats";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { getContentLabel, useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";

interface VotingQuestionCardProps {
  contentId: bigint;
  categoryId: bigint;
  onVote: (isUp: boolean) => void;
  isCommitting: boolean;
  address?: string;
  error?: string | null;
  isOwnContent?: boolean;
  /** When true, removes card background/rounding (parent provides it). */
  embedded?: boolean;
}

type CountdownUrgency = "normal" | "warning" | "critical";

function formatRoundCountdown(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

function getCountdownUrgency(seconds: number): CountdownUrgency {
  if (seconds <= 3600) return "critical";
  if (seconds <= 21600) return "warning";
  return "normal";
}

/**
 * Displays the voting question and all voting controls in a separate card.
 */
export function VotingQuestionCard({
  contentId,
  categoryId,
  onVote,
  isCommitting,
  address,
  error,
  isOwnContent,
  embedded,
}: VotingQuestionCardProps) {
  const { data: currentRating } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "getRating",
    args: [contentId],
  });

  const currentRatingValue = currentRating ? Number(currentRating) : 50;

  // Get category for the ranking question
  const { categories } = useCategoryRegistry();
  const category = useMemo(() => categories.find(c => c.id === categoryId), [categories, categoryId]);

  const contentLabel = useMemo(() => getContentLabel(categoryId, categories), [categoryId, categories]);

  // Build the question text from the category's ranking question
  const questionText = useMemo(() => {
    if (category?.rankingQuestion) {
      return category.rankingQuestion.replace("{rating}", currentRatingValue.toString());
    }
    return `Should this ${contentLabel} be rated higher or lower than ${currentRatingValue} out of 100?`;
  }, [category, currentRatingValue, contentLabel]);

  // Check if user already voted on this content in the current round
  const roundSnapshot = useRoundSnapshot(contentId);
  const { roundId, isRoundFull, phase, voteCount, revealedCount, minVoters, roundTimeRemaining } = roundSnapshot;
  const countdownTimeLeft = phase === "voting" && roundTimeRemaining > 0 ? roundTimeRemaining : 0;
  const urgency = getCountdownUrgency(countdownTimeLeft);
  const countdownLabel = formatRoundCountdown(countdownTimeLeft);
  const countdownActive = countdownTimeLeft > 0;
  const pendingRevealCount = Math.max(0, voteCount - revealedCount);

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
      className={`relative ${embedded ? "" : "rounded-2xl"} h-full flex flex-col overflow-visible p-4 space-y-3 xl:p-3 xl:space-y-2.5 2xl:p-4 2xl:space-y-3`}
      style={embedded ? {} : { background: "var(--color-base-200)" }}
    >
      {/* Content */}
      <div className="relative z-10 flex flex-col flex-1">
        {/* Question at the top */}
        <p className="text-center text-white font-bold mb-2" style={{ fontSize: "20px" }}>
          {(() => {
            const ratingSlash = `${currentRatingValue} out of 100`;
            const ratingPercent = `${currentRatingValue}%`;
            const highlightTarget = questionText.includes(ratingSlash)
              ? ratingSlash
              : questionText.includes(ratingPercent)
                ? ratingPercent
                : null;
            if (highlightTarget) {
              const ratingStr = currentRatingValue.toString();
              const suffix = highlightTarget.slice(ratingStr.length);
              return (
                <>
                  {questionText.split(highlightTarget)[0]}
                  <span className="text-primary text-[1.15em]">{ratingStr}</span>
                  {suffix}
                  {questionText.split(highlightTarget)[1]}
                </>
              );
            }
            return questionText;
          })()}
          <span
            className="inline-block ml-1.5 align-middle tooltip tooltip-bottom cursor-help"
            data-tip="Illegal content, content that doesn't load, or content with the wrong description should be downvoted."
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="opacity-50"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </span>
        </p>

        {/* Voter count icons */}
        {phase === "voting" && (
          <div className="flex justify-center mb-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="flex -space-x-1">
                {Array.from({ length: Math.min(revealedCount, 7) }).map((_, i) => (
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
                {Array.from({
                  length: Math.min(Math.max(0, minVoters - revealedCount), 7 - Math.min(revealedCount, 7)),
                }).map((_, i) => (
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
                text={`${revealedCount} of ${minVoters} votes revealed.${pendingRevealCount > 0 ? ` ${pendingRevealCount} commit${pendingRevealCount === 1 ? "" : "s"} still pending reveal.` : ""} ${Math.max(0, minVoters - revealedCount) > 0 ? `${Math.max(0, minVoters - revealedCount)} more revealed vote${Math.max(0, minVoters - revealedCount) === 1 ? "" : "s"} needed before settlement can start.` : "Threshold reached. Settlement follows once past-epoch reveal checks clear."}`}
                position="bottom"
              />
            </span>
          </div>
        )}

        {/* Vote error message */}
        {error && <p className="text-base text-center text-red-400 mb-2">{error}</p>}

        {/* Voting arrows - centered below question */}
        <div className="flex items-center justify-center gap-2 lg:gap-3 mb-3">
          {address ? (
            hasMyVote ? (
              /* Already committed — direction hidden until blind phase ends */
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
                data-tip="Your vote is encrypted until the blind phase ends. The keeper normally reveals eligible votes afterward, and you can self-reveal if needed."
              >
                <span className="text-base font-semibold text-primary">Committed</span>
                <span className="text-base text-base-content/50">hidden</span>
              </div>
            ) : isOwnContent ? (
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
                data-tip="Content submitters cannot vote on their own submissions."
              >
                <span className="text-base text-base-content/40">Your submission</span>
              </div>
            ) : isRoundFull ? (
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
                data-tip="This round has reached the maximum number of voters. A new round will start after resolution."
              >
                <span className="text-base text-base-content/40">Round full</span>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onVote(false)}
                  className="vote-btn vote-no"
                  disabled={isCommitting}
                  aria-label="Vote down"
                >
                  <span className="vote-bg" />
                  <span className="vote-symbol">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-sm"
                    >
                      <path d="M12 18 L6 6 L18 6 Z" />
                    </svg>
                  </span>
                </button>

                <button
                  onClick={() => onVote(true)}
                  className="vote-btn vote-yes"
                  disabled={isCommitting}
                  aria-label="Vote up"
                >
                  <span className="vote-bg" />
                  <span className="vote-symbol">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="drop-shadow-sm"
                    >
                      <path d="M12 6 L6 18 L18 18 Z" />
                    </svg>
                  </span>
                </button>
              </>
            )
          ) : (
            <RainbowKitCustomConnectButton />
          )}
        </div>

        {/* Round progress - left aligned */}
        <div className="mb-1.5 flex justify-start">
          <RoundProgress snapshot={roundSnapshot} />
        </div>

        {/* Urgent countdown (warning/critical only) */}
        {countdownActive && (urgency === "warning" || urgency === "critical") && (
          <div className="mb-1.5 flex justify-start">
            <span
              className={`text-xs tabular-nums ${urgency === "critical" ? "text-error animate-pulse" : "text-warning"}`}
            >
              {countdownLabel}
            </span>
          </div>
        )}

        {/* Round stats - below progress, left aligned */}
        <div className="mb-3 flex justify-start">
          <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
        </div>

        {/* Rating history chart at the bottom */}
        <div className="mt-auto">
          <RatingHistory contentId={contentId} />
        </div>
      </div>
    </div>
  );
}
