"use client";

import { useAccount } from "wagmi";
import { FooterLinks } from "~~/components/FooterLinks";
import { ContentFeedbackPanel } from "~~/components/feedback/ContentFeedbackPanel";
import { VOTING_SURFACE_BACKGROUND, VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import type { ContentItem } from "~~/hooks/useContentFeed";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";

interface VoteSignalRailProps {
  primaryItem: ContentItem | null;
  activeIndex: number;
  totalCount: number;
  isCommitting: boolean;
  voteError?: string | null;
  cooldownSecondsRemaining: number;
  isVoteEligibilityPending?: boolean;
  attentionToken?: number | null;
  onVote: (item: ContentItem, isUp: boolean) => void;
}

export function VoteSignalRail({
  primaryItem,
  isCommitting,
  voteError,
  cooldownSecondsRemaining,
  isVoteEligibilityPending = false,
  attentionToken,
  onVote,
}: VoteSignalRailProps) {
  const { address } = useAccount();
  const { openConnectModal } = useCuryoConnectModal();

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <aside
        className={`surface-card flex w-full min-w-0 flex-col rounded-[2rem] p-4 ${attentionToken ? "vote-surface-attention" : ""}`}
        data-vote-attention={attentionToken ? "true" : undefined}
        style={{ background: VOTING_SURFACE_BACKGROUND }}
      >
        {primaryItem ? (
          <VotingQuestionCard
            contentId={primaryItem.id}
            categoryId={primaryItem.categoryId}
            questionTitle={primaryItem.question || primaryItem.title}
            currentRating={primaryItem.rating}
            rewardPoolSummary={primaryItem.rewardPoolSummary}
            openRound={primaryItem.openRound}
            roundConfig={primaryItem.roundConfig}
            onVote={isUp => onVote(primaryItem, isUp)}
            isCommitting={isCommitting}
            address={address}
            error={voteError}
            cooldownSecondsRemaining={cooldownSecondsRemaining}
            isVoteEligibilityPending={isVoteEligibilityPending}
            isOwnContent={primaryItem.isOwnContent}
            embedded
            compact
            variant="signal"
            attentionToken={attentionToken}
          />
        ) : null}
      </aside>

      {primaryItem ? <ContentFeedbackPanel item={primaryItem} onRequestConnect={openConnectModal} /> : null}

      <FooterLinks
        className="px-1"
        listClassName="justify-start text-[0.72rem] leading-5 text-base-content/62"
        linkClassName="text-base-content/66 no-underline transition-colors hover:text-base-content/90 hover:underline"
        separatorClassName="text-base-content/42"
      />
    </div>
  );
}
