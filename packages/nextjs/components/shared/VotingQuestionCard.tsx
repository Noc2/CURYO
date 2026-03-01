"use client";

import { useEffect, useMemo, useState } from "react";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { RatingHistory } from "~~/components/shared/RatingHistory";
import { RoundProgress } from "~~/components/shared/RoundProgress";
import { RoundStats } from "~~/components/shared/RoundStats";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
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

/** 24-hour cooldown in seconds */
const VOTE_COOLDOWN_SECONDS = 24 * 60 * 60;

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
  const { phase, voteCount, minVoters } = useRoundPhase(contentId);

  const { data: tokenSymbol } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "symbol",
  });
  const symbol = tokenSymbol ?? "cREP";

  // Read user's vote from the contract
  const { data: myVoteData } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getVote" as any,
    args: [contentId, roundId, address] as any,
    query: { enabled: roundId > 0n && !!address },
  } as any);

  const myVoteStake = myVoteData ? Number((myVoteData as any).stake ?? (myVoteData as any)[1] ?? 0n) : 0;
  const myVoteIsUp = myVoteData ? ((myVoteData as any).isUp ?? (myVoteData as any)[2]) : false;
  const hasMyVote = myVoteStake > 0;

  // Vote cooldown: read last vote timestamp from contract (time-based, 24 hours)
  const { data: lastVoteTimeRaw } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "lastVoteTimestamp" as any,
    args: [contentId, address] as any,
  } as any);

  // Tick every 60s so the cooldown transitions from active→inactive without a page reload
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const interval = setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 60_000);
    return () => clearInterval(interval);
  }, []);

  const cooldownInfo = useMemo(() => {
    const lastVoteTime = lastVoteTimeRaw != null ? Number(BigInt(lastVoteTimeRaw as any)) : 0;
    if (lastVoteTime === 0) return { active: false, remaining: 0, hoursSince: 0 };
    const elapsed = nowSeconds - lastVoteTime;
    const remaining = Math.max(0, VOTE_COOLDOWN_SECONDS - elapsed);
    const hoursSince = Math.floor(elapsed / 3600);
    const hoursRemaining = Math.ceil(remaining / 3600);
    return { active: remaining > 0, remaining, hoursSince, hoursRemaining };
  }, [lastVoteTimeRaw, nowSeconds]);

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

        {/* Voter count icons */}
        {phase === "voting" && (
          <div className="flex justify-center mb-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="flex -space-x-1">
                {Array.from({ length: Math.min(voteCount, 7) }).map((_, i) => (
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
                {Array.from({ length: Math.min(Math.max(0, minVoters - voteCount), 7 - Math.min(voteCount, 7)) }).map(
                  (_, i) => (
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
                  ),
                )}
              </span>
              <InfoTooltip
                text={`${voteCount} of ${minVoters} voters. ${Math.max(0, minVoters - voteCount) > 0 ? `${Math.max(0, minVoters - voteCount)} more vote${Math.max(0, minVoters - voteCount) === 1 ? "" : "s"} needed.` : "Ready to settle."} Votes are public and price-moving.`}
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
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
                data-tip={`Your stake is locked until the round settles. After settlement, there is a 24-hour cooldown before you can vote on this ${contentLabel} again.`}
              >
                <span className={`text-base font-semibold ${myVoteIsUp ? "text-success" : "text-error"}`}>
                  Voted {myVoteIsUp ? "Up" : "Down"}
                </span>
                <span className="text-base text-base-content/50">
                  {(myVoteStake / 1e6).toFixed(0)} {symbol}
                </span>
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
                data-tip="This round has reached the maximum number of voters. A new round will start after settlement."
              >
                <span className="text-base text-base-content/40">Round full</span>
              </div>
            ) : cooldownInfo.active ? (
              <div
                className="tooltip tooltip-bottom cursor-help flex items-center gap-2 px-4 py-2 rounded-full bg-base-content/5 border border-base-content/10"
                data-tip={`You voted on this ${contentLabel} ${cooldownInfo.hoursSince} hour${cooldownInfo.hoursSince !== 1 ? "s" : ""} ago. You can vote again in ${cooldownInfo.hoursRemaining} hour${cooldownInfo.hoursRemaining !== 1 ? "s" : ""}.`}
              >
                <span className="text-base text-base-content/40">Cooldown &middot; {cooldownInfo.hoursRemaining}h</span>
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
