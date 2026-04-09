"use client";

export interface RoundClaimableRewardItem {
  contentId: bigint;
  roundId: bigint;
  reward: bigint;
  claimType: "reward" | "refund" | "submitter_reward";
}

export interface SubmitterParticipationClaimableRewardItem {
  contentId: bigint;
  reward: bigint;
  claimType: "submitter_participation_reward";
}

export interface FrontendRoundFeeClaimableRewardItem {
  contentId: bigint;
  roundId: bigint;
  frontend: `0x${string}`;
  reward: bigint;
  claimType: "frontend_round_fee";
}

export interface FrontendRegistryClaimableRewardItem {
  frontend: `0x${string}`;
  reward: bigint;
  claimType: "frontend_registry_fee";
}

export type ClaimableRewardItem =
  | RoundClaimableRewardItem
  | SubmitterParticipationClaimableRewardItem
  | FrontendRoundFeeClaimableRewardItem
  | FrontendRegistryClaimableRewardItem;

interface SubmitterRewardClaimCandidate {
  contentId: bigint;
  roundId: bigint;
  pendingReward: bigint;
  alreadyClaimed: boolean;
}

interface SubmitterParticipationClaimCandidate {
  contentId: bigint;
  totalReward: bigint;
  alreadyPaid: bigint;
  reservedReward: bigint;
  rewardPool: `0x${string}` | null;
}

interface ParticipationPoolClaimState {
  authorized: boolean;
  poolBalance: bigint;
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

export function buildSubmitterParticipationClaimableRewards(
  candidates: readonly SubmitterParticipationClaimCandidate[],
  poolStates: ReadonlyMap<`0x${string}`, ParticipationPoolClaimState>,
) {
  const availableStreamingByPool = new Map<`0x${string}`, bigint>();

  return candidates.flatMap(candidate => {
    const { contentId, totalReward, alreadyPaid, reservedReward, rewardPool } = candidate;
    if (!rewardPool || totalReward <= alreadyPaid) {
      return [];
    }

    const reservedRemaining = reservedReward > alreadyPaid ? reservedReward - alreadyPaid : 0n;
    const remainingAfterReserved =
      totalReward > alreadyPaid + reservedRemaining ? totalReward - alreadyPaid - reservedRemaining : 0n;

    const poolState = poolStates.get(rewardPool);
    const initialStreamingBalance = poolState?.authorized ? poolState.poolBalance : 0n;
    const streamingBalance = availableStreamingByPool.has(rewardPool)
      ? availableStreamingByPool.get(rewardPool)!
      : initialStreamingBalance;
    const streamedReward = remainingAfterReserved > streamingBalance ? streamingBalance : remainingAfterReserved;

    availableStreamingByPool.set(rewardPool, streamingBalance - streamedReward);

    const claimableReward = reservedRemaining + streamedReward;
    if (claimableReward <= 0n) {
      return [];
    }

    return [
      {
        contentId,
        reward: claimableReward,
        claimType: "submitter_participation_reward" as const,
      } satisfies ClaimableRewardItem,
    ];
  });
}

export function getClaimableRoundKey(item: ClaimableRewardItem) {
  return "roundId" in item ? `${item.contentId.toString()}-${item.roundId.toString()}` : null;
}

function claimExecutionPriority(item: ClaimableRewardItem) {
  switch (item.claimType) {
    case "refund":
      return 0;
    case "reward":
      return 1;
    case "submitter_reward":
      return 2;
    case "submitter_participation_reward":
      return 3;
    case "frontend_round_fee":
      return 4;
    case "frontend_registry_fee":
      return 5;
  }
}

export function sortClaimableRewardItems(items: readonly ClaimableRewardItem[]) {
  return [...items].sort((left, right) => {
    const priorityDelta = claimExecutionPriority(left) - claimExecutionPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if ("contentId" in left && "contentId" in right && left.contentId !== right.contentId) {
      return left.contentId < right.contentId ? -1 : 1;
    }

    if ("roundId" in left && "roundId" in right && left.roundId !== right.roundId) {
      return left.roundId < right.roundId ? -1 : 1;
    }

    if ("frontend" in left && "frontend" in right && left.frontend !== right.frontend) {
      return left.frontend.localeCompare(right.frontend);
    }

    return 0;
  });
}
