"use client";

import { useMemo } from "react";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { CuryoVoteButton } from "~~/components/shared/CuryoVoteButton";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundStats } from "~~/components/shared/RoundStats";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { getContentLabel, useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import { buildRankingQuestionDisplay } from "~~/lib/categories/rankingQuestionTemplate";
import { formatVoteCooldownRemaining } from "~~/lib/vote/cooldown";
import { getBlindParticipationLabel } from "~~/lib/vote/voteIncentives";
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

/**
 * Displays the voting question and all voting controls in a separate card.
 */
export function VotingQuestionCard({
  contentId,
  categoryId,
  title,
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

  // Get category for the ranking question
  const { categories } = useCategoryRegistry();
  const category = useMemo(() => categories.find(c => c.id === categoryId), [categories, categoryId]);

  const contentLabel = useMemo(() => getContentLabel(categoryId, categories), [categoryId, categories]);

  // Build the question text from the category's ranking question
  const questionDisplay = useMemo(() => {
    return buildRankingQuestionDisplay(category?.rankingQuestion, {
      title,
      rating: currentRatingValue,
      fallbackLabel: contentLabel,
    });
  }, [category?.rankingQuestion, contentLabel, currentRatingValue, title]);

  // Check if user already voted on this content in the current round
  const roundSnapshot = useRoundSnapshot(contentId);
  const { ratePercent } = useParticipationRate();
  const {
    roundId,
    isEpoch1,
    isRoundFull,
    phase,
    voteCount,
    revealedCount,
    minVoters,
    readyToSettle,
    thresholdReachedAt,
  } = roundSnapshot;
  const pendingRevealCount = Math.max(0, voteCount - revealedCount);
  const { filled: filledVoteIcons, empty: emptyVoteIcons } = computeVoteProgressIconCounts({ voteCount, minVoters });
  const cooldownActive = cooldownSecondsRemaining > 0;
  const cooldownLabel = formatVoteCooldownRemaining(cooldownSecondsRemaining);
  const blindParticipationLabel = phase === "voting" && isEpoch1 ? getBlindParticipationLabel(ratePercent) : null;
  const votersNeeded = Math.max(0, minVoters - voteCount);
  const revealsNeeded = Math.max(0, minVoters - revealedCount);
  const incentivePrompt =
    phase !== "voting"
      ? null
      : isEpoch1
        ? blindParticipationLabel
          ? `${blindParticipationLabel} if you vote during the blind phase.`
          : "Vote early to lock in the 4x blind-phase reward weight."
        : readyToSettle || thresholdReachedAt > 0
          ? "Live pools are visible and this round is close to settlement."
          : votersNeeded > 0
            ? `Live pools are visible. ${votersNeeded} more voter${votersNeeded === 1 ? "" : "s"} can unlock settlement.`
            : revealsNeeded > 0
              ? `${revealsNeeded} more reveal${revealsNeeded === 1 ? "" : "s"} and this round can settle.`
              : "Live pools are visible. Add your vote and help settle this round.";
  const incentivePromptClassName = isEpoch1 ? "text-primary/80" : "text-warning";
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

  const renderQuestionSegment = (segment: string) => {
    const ratingSlash = `${currentRatingValue} out of 100`;
    const ratingPercent = `${currentRatingValue}%`;
    const highlightTarget = segment.includes(ratingSlash)
      ? ratingSlash
      : segment.includes(ratingPercent)
        ? ratingPercent
        : null;

    if (!highlightTarget) {
      return segment;
    }

    const ratingStr = currentRatingValue.toString();
    const suffix = highlightTarget.slice(ratingStr.length);
    const [before, after = ""] = segment.split(highlightTarget);

    return (
      <>
        {before}
        <span className="text-primary text-[1.15em]">{ratingStr}</span>
        {suffix}
        {after}
      </>
    );
  };

  return (
    <div
      className={`relative ${embedded ? "" : "rounded-2xl"} flex h-full min-h-0 flex-col overflow-hidden p-4 space-y-3 xl:p-3 xl:space-y-2.5 2xl:p-4 2xl:space-y-3`}
      style={embedded ? {} : { background: "var(--color-base-200)" }}
    >
      {/* Content */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Question at the top */}
        <p className="font-heading mb-3 shrink-0 break-words text-center text-[1.12rem] font-bold leading-[1.2] tracking-tight text-white xl:text-[1.16rem] 2xl:text-[1.24rem]">
          {questionDisplay.title ? (
            <>
              {questionDisplay.beforeTitle ? renderQuestionSegment(questionDisplay.beforeTitle) : null}
              <span>{questionDisplay.title}</span>
              {questionDisplay.afterTitle ? renderQuestionSegment(questionDisplay.afterTitle) : null}
            </>
          ) : (
            renderQuestionSegment(questionDisplay.fullText)
          )}
          <span
            className="tooltip tooltip-bottom ml-1.5 inline-block cursor-help align-middle"
            data-tip="Illegal content, content that doesn't load, or content with the wrong description should be downvoted."
          >
            <svg
              width="18"
              height="18"
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

        {/* Committed voter icons */}
        {phase === "voting" && (
          <div className="mb-2 flex shrink-0 justify-center">
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
          </div>
        )}

        <div className="mb-1.5 flex shrink-0 justify-start">
          <RoundProgress snapshot={roundSnapshot} />
        </div>

        {incentivePrompt ? (
          <div className="mb-1.5 flex shrink-0 justify-start">
            <p className={`text-sm ${incentivePromptClassName}`}>{incentivePrompt}</p>
          </div>
        ) : null}

        <div className="mb-3 flex shrink-0 justify-start">
          <RoundStats categoryId={categoryId} snapshot={roundSnapshot} />
        </div>

        {/* Vote error message */}
        {displayError && <p className="mb-2 text-center text-base text-red-400">{displayError}</p>}

        {/* Voting arrows - centered below question */}
        <div className="mb-3 flex shrink-0 items-center justify-center gap-2 lg:gap-3">
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
            ) : cooldownActive ? (
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
                data-tip={`You already voted on this content within the last 24 hours. Try again in ${cooldownLabel}.`}
              >
                <span className="text-base font-medium text-base-content/55">Cooldown</span>
                <span className="text-base text-base-content/35">{cooldownLabel}</span>
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
                <CuryoVoteButton direction="down" onClick={() => onVote(false)} disabled={isCommitting} />
                <CuryoVoteButton direction="up" onClick={() => onVote(true)} disabled={isCommitting} />
              </>
            )
          ) : (
            <RainbowKitCustomConnectButton />
          )}
        </div>

        {/* Rating history chart */}
        <div className="mt-auto shrink-0 pt-1.5 xl:pt-1">
          <RatingHistory contentId={contentId} />
        </div>
      </div>
    </div>
  );
}
