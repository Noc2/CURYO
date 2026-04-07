"use client";

import { useAccount } from "wagmi";
import { FooterLinks } from "~~/components/FooterLinks";
import { ClaimRewardsButton } from "~~/components/shared/ClaimRewardsButton";
import { VotingQuestionCard } from "~~/components/shared/VotingQuestionCard";
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
      <aside className="surface-card flex w-full min-w-0 flex-col rounded-[2rem] bg-[radial-gradient(circle_at_50%_14%,rgba(255,153,104,0.18),transparent_34%),radial-gradient(circle_at_50%_58%,rgba(255,241,216,0.08),transparent_40%)] p-4">
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
        listClassName="justify-start text-[0.72rem] leading-5 text-base-content/44"
        linkClassName="text-base-content/44 no-underline transition-colors hover:text-base-content/70 hover:underline"
        separatorClassName="text-base-content/28"
      />
    </div>
  );
}
