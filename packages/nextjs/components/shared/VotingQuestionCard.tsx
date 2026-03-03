"use client";

import { useMemo } from "react";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundStats } from "~~/components/shared/RoundStats";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { getContentLabel, useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import { useRoundInfo } from "~~/hooks/useRoundInfo";
import { useRoundPhase } from "~~/hooks/useRoundPhase";

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
  const { roundId, isRoundFull } = useRoundInfo(contentId);
  const { phase, voteCount } = useRoundPhase(contentId);

  // Check if user has committed to this round (tlock: direction hidden until reveal)
  // voterCommitHash(contentId, roundId, voter) returns bytes32 (0 = no commit)
  const { data: myCommitHash } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "voterCommitHash" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: roundId > 0n && !!address },
  } as any);

  const hasMyVote =
    myCommitHash != null &&
    (myCommitHash as unknown as string) !== "0x0000000000000000000000000000000000000000000000000000000000000000";

  return (
    <div
      className={`relative ${embedded ? "" : "rounded-2xl"} p-4 space-y-3 overflow-visible h-full flex flex-col`}
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

        {/* Vote count */}
        {phase === "voting" && voteCount > 0 && (
          <p className="text-sm text-center text-base-content/40 mb-2">
            {voteCount} vote{voteCount === 1 ? "" : "s"}
          </p>
        )}

        {/* Vote error message */}
        {error && <p className="text-base text-center text-red-400 mb-2">{error}</p>}

        {/* Voting arrows - centered below question */}
        <div className="flex items-center justify-center gap-2 lg:gap-3 mb-3">
          {address ? (
            hasMyVote ? (
              /* Already committed — direction hidden until epoch ends (tlock) */
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
                data-tip="Your vote is committed and encrypted until the epoch ends. The keeper reveals it automatically."
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
          <RoundProgress contentId={contentId} />
        </div>

        {/* Round stats - below progress, left aligned */}
        <div className="mb-3 flex justify-start">
          <RoundStats contentId={contentId} categoryId={categoryId} />
        </div>

        {/* Rating history chart at the bottom */}
        <div className="mt-auto">
          <RatingHistory contentId={contentId} />
        </div>
      </div>
    </div>
  );
}
