"use client";

export interface RoundClaimableRewardItem {
  contentId: bigint;
  roundId: bigint;
  reward: bigint;
  claimType: "reward" | "refund" | "participation_reward";
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

export interface QuestionRewardPoolClaimableRewardItem {
  rewardPoolId: bigint;
  contentId: bigint;
  roundId: bigint;
  reward: bigint;
  title: string;
  claimType: "question_reward";
}

export interface QuestionBundleRewardClaimableRewardItem {
  bundleId: bigint;
  roundSetIndex: bigint;
  reward: bigint;
  title: string;
  claimType: "question_bundle_reward";
}

export type ClaimableRewardItem =
  | RoundClaimableRewardItem
  | FrontendRoundFeeClaimableRewardItem
  | FrontendRegistryClaimableRewardItem
  | QuestionRewardPoolClaimableRewardItem
  | QuestionBundleRewardClaimableRewardItem;

interface VoterParticipationRewardClaimCandidate {
  contentId: bigint;
  roundId: bigint;
  stake: bigint;
  rateBps: bigint;
  totalReward: bigint;
  alreadyPaid: bigint;
  reservedReward: bigint;
  rewardPool: `0x${string}` | null;
  alreadyClaimed: boolean;
}

export function buildVoterParticipationClaimableRewards(candidates: readonly VoterParticipationRewardClaimCandidate[]) {
  return candidates.flatMap(candidate => {
    const { contentId, roundId, stake, rateBps, totalReward, alreadyPaid, reservedReward, rewardPool, alreadyClaimed } =
      candidate;

    if (alreadyClaimed || !rewardPool || stake <= 0n || rateBps <= 0n || totalReward <= 0n) {
      return [];
    }

    const fullReward = (stake * rateBps) / 10000n;
    if (fullReward <= 0n) {
      return [];
    }

    const currentlyClaimable = reservedReward < totalReward ? (fullReward * reservedReward) / totalReward : fullReward;
    const claimableReward = currentlyClaimable > alreadyPaid ? currentlyClaimable - alreadyPaid : 0n;
    if (claimableReward <= 0n) {
      return [];
    }

    return [
      {
        contentId,
        roundId,
        reward: claimableReward,
        claimType: "participation_reward" as const,
      } satisfies ClaimableRewardItem,
    ];
  });
}

export function getClaimableRoundKey(item: ClaimableRewardItem) {
  if (item.claimType === "question_reward") {
    return `question-reward:${item.rewardPoolId.toString()}-${item.roundId.toString()}`;
  }
  if (item.claimType === "question_bundle_reward") {
    return `question-bundle-reward:${item.bundleId.toString()}-${item.roundSetIndex.toString()}`;
  }
  return "roundId" in item ? `${item.contentId.toString()}-${item.roundId.toString()}` : null;
}

function claimExecutionPriority(item: ClaimableRewardItem) {
  switch (item.claimType) {
    case "refund":
      return 0;
    case "reward":
      return 1;
    case "participation_reward":
      return 2;
    case "question_reward":
      return 3;
    case "question_bundle_reward":
      return 4;
    case "frontend_round_fee":
      return 5;
    case "frontend_registry_fee":
      return 6;
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
