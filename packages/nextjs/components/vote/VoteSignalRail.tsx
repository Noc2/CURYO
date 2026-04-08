"use client";

import { useAccount } from "wagmi";
import { FooterLinks } from "~~/components/FooterLinks";
import { ClaimRewardsButton } from "~~/components/shared/ClaimRewardsButton";
import { VOTING_SURFACE_BACKGROUND, VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import type { ContentItem } from "~~/hooks/useContentFeed";

interface VoteSignalRailProps {
  primaryItem: ContentItem | null;
  activeIndex: number;
  totalCount: number;
  isCommitting: boolean;
  voteError?: string | null;
  cooldownSecondsRemaining: number;
  onVote: (item: ContentItem, isUp: boolean) => void;
}

export function VoteSignalRail({
  primaryItem,
  isCommitting,
  voteError,
  cooldownSecondsRemaining,
  onVote,
}: VoteSignalRailProps) {
  const { address } = useAccount();
  const { totalClaimable } = useAllClaimableRewards();

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <aside
        className="surface-card flex w-full min-w-0 flex-col rounded-[2rem] p-4"
        style={{ background: VOTING_SURFACE_BACKGROUND }}
      >
        {primaryItem ? (
          <VotingQuestionCard
            contentId={primaryItem.id}
            categoryId={primaryItem.categoryId}
            currentRating={primaryItem.rating}
            openRound={primaryItem.openRound}
            onVote={isUp => onVote(primaryItem, isUp)}
            isCommitting={isCommitting}
            address={address}
            error={voteError}
            cooldownSecondsRemaining={cooldownSecondsRemaining}
            isOwnContent={primaryItem.isOwnContent}
            embedded
            compact
            variant="signal"
          />
        ) : null}

        {address && totalClaimable > 0n ? (
          <div className="mt-4">
            <ClaimRewardsButton buttonClassName="btn btn-primary btn-sm h-10 min-h-0 w-full rounded-full border-none text-sm" />
          </div>
        ) : null}
      </aside>

      <FooterLinks
        className="px-1"
        listClassName="justify-start text-[0.72rem] leading-5 text-base-content/62"
        linkClassName="text-base-content/66 no-underline transition-colors hover:text-base-content/90 hover:underline"
        separatorClassName="text-base-content/42"
      />
    </div>
  );
}
