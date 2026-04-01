"use client";

export type ClaimableRewardType = "reward" | "refund" | "submitter_reward";

export interface ClaimableRewardItem {
  contentId: bigint;
  roundId: bigint;
  reward: bigint;
  claimType: ClaimableRewardType;
}

export interface SubmitterRewardClaimCandidate {
  contentId: bigint;
  roundId: bigint;
  pendingReward: bigint;
  alreadyClaimed: boolean;
}

export function buildSubmitterClaimableRewards(candidates: readonly SubmitterRewardClaimCandidate[]) {
  return candidates
    .filter(candidate => candidate.pendingReward > 0n && !candidate.alreadyClaimed)
    .map(
      candidate =>
        ({
          contentId: candidate.contentId,
          roundId: candidate.roundId,
          reward: candidate.pendingReward,
          claimType: "submitter_reward" as const,
        }) satisfies ClaimableRewardItem,
    );
}
