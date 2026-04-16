import { ParticipationPoolAbi } from "@curyo/contracts/abis";
import { EPOCH_WEIGHT_BPS, REWARD_SPLIT_BPS, ROUND_STATE } from "@curyo/contracts/protocol";
import type { Hex } from "viem";
import { getAccount, getWalletClient, publicClient, validateContractKeys } from "../client.js";
import { getIdentityConfig, log, type BotContractKey, type BotRole, config } from "../config.js";
import { contractConfig } from "../contracts.js";
import { type PonderContentItem, type PonderVoteItem, ponder } from "../ponder.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const TX_RECEIPT_TIMEOUT_MS = 180_000;

type ClaimPlanItem = {
  claimType:
    | "refund"
    | "reward"
    | "participation_reward"
    | "submitter_reward"
    | "submitter_participation_reward";
  contentId: bigint;
  roundId?: bigint;
  estimatedReward: bigint;
  label: string;
  write: {
    abi: unknown;
    address: `0x${string}`;
    args: readonly unknown[];
    functionName: string;
  };
};

type SubmitterParticipationCandidate = {
  content: PonderContentItem;
  alreadyPaid: bigint;
  reservedReward: bigint;
  rewardPool: `0x${string}` | null;
  totalReward: bigint;
};

type ParticipationPoolClaimState = {
  authorized: boolean;
  poolBalance: bigint;
};

function safeBigInt(value: string | number | bigint | null | undefined): bigint {
  try {
    return BigInt(value ?? 0);
  } catch {
    return 0n;
  }
}

function formatCrepAmount(value: bigint) {
  return `${(Number(value) / 1e6).toFixed(2)} cREP`;
}

function epochWeightBps(epochIndex: number): number {
  return epochIndex === 0 ? EPOCH_WEIGHT_BPS.blind : EPOCH_WEIGHT_BPS.informed;
}

function configuredContractKeysForClaim(role: BotRole): readonly BotContractKey[] {
  return role === "submit"
    ? (["contentRegistry", "roundRewardDistributor"] as const)
    : (["votingEngine", "roundRewardDistributor"] as const);
}

function claimPriority(item: ClaimPlanItem) {
  switch (item.claimType) {
    case "refund":
      return 0;
    case "reward":
      return 1;
    case "participation_reward":
      return 2;
    case "submitter_reward":
      return 3;
    case "submitter_participation_reward":
      return 4;
  }
}

function sortClaimPlan(items: readonly ClaimPlanItem[]) {
  return [...items].sort((left, right) => {
    const priorityDelta = claimPriority(left) - claimPriority(right);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }

    if (left.contentId !== right.contentId) {
      return left.contentId < right.contentId ? -1 : 1;
    }

    if (left.roundId !== undefined && right.roundId !== undefined && left.roundId !== right.roundId) {
      return left.roundId < right.roundId ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
}

async function waitForClaimReceipt(hash: Hex, label: string): Promise<void> {
  log.info(`Waiting for ${label} receipt: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    timeout: TX_RECEIPT_TIMEOUT_MS,
  });

  if (receipt.status !== "success") {
    throw new Error(`${label} transaction reverted: ${hash}`);
  }
}

async function estimateRoundReward(vote: PonderVoteItem): Promise<bigint> {
  const stake = safeBigInt(vote.stake);
  if (vote.roundUpWins === null || vote.isUp === null) {
    return 0n;
  }

  if (vote.isUp !== vote.roundUpWins) {
    return (stake * BigInt(REWARD_SPLIT_BPS.revealedLoserRefund)) / 10000n;
  }

  const contentId = safeBigInt(vote.contentId);
  const roundId = safeBigInt(vote.roundId);
  const [voterPool, weightedWinningStake] = (await Promise.all([
    publicClient.readContract({
      ...contractConfig.votingEngine,
      functionName: "roundVoterPool",
      args: [contentId, roundId],
    }),
    publicClient.readContract({
      ...contractConfig.votingEngine,
      functionName: "roundWinningStake",
      args: [contentId, roundId],
    }),
  ])) as readonly [bigint, bigint];

  if (weightedWinningStake <= 0n) {
    return stake;
  }

  const effectiveStake = (stake * BigInt(epochWeightBps(vote.epochIndex))) / 10000n;
  const poolShare = (effectiveStake * voterPool) / weightedWinningStake;
  return stake + poolShare;
}

async function buildRateBotClaimPlan(address: `0x${string}`): Promise<ClaimPlanItem[]> {
  const votes = await ponder.getAllVotes({ voter: address });
  const items: ClaimPlanItem[] = [];

  for (const vote of votes) {
    const roundState = vote.roundState;
    const contentId = safeBigInt(vote.contentId);
    const roundId = safeBigInt(vote.roundId);
    const stake = safeBigInt(vote.stake);

    if (roundState === null || contentId <= 0n || roundId <= 0n) {
      continue;
    }

    const isRefundClaim =
      roundState === ROUND_STATE.Cancelled ||
      ((roundState === ROUND_STATE.Tied || roundState === ROUND_STATE.RevealFailed) && vote.revealed);

    if (isRefundClaim) {
      const alreadyClaimed = (await publicClient.readContract({
        ...contractConfig.votingEngine,
        functionName: "cancelledRoundRefundClaimed",
        args: [contentId, roundId, address],
      })) as boolean;

      if (!alreadyClaimed && stake > 0n) {
        items.push({
          claimType: "refund",
          contentId,
          roundId,
          estimatedReward: stake,
          label: `refund for content #${contentId} round #${roundId}`,
          write: {
            ...contractConfig.votingEngine,
            functionName: "claimCancelledRoundRefund",
            args: [contentId, roundId],
          },
        });
      }
      continue;
    }

    const isSettledRewardCandidate =
      roundState === ROUND_STATE.Settled && vote.revealed && vote.isUp !== null && vote.roundUpWins !== null;
    if (!isSettledRewardCandidate) {
      continue;
    }

    const rewardClaimed = (await publicClient.readContract({
      ...contractConfig.distributor,
      functionName: "rewardClaimed",
      args: [contentId, roundId, address],
    })) as boolean;

    if (!rewardClaimed) {
      const estimatedReward = await estimateRoundReward(vote);
      if (estimatedReward > 0n) {
        items.push({
          claimType: "reward",
          contentId,
          roundId,
          estimatedReward,
          label: `round payout for content #${contentId} round #${roundId}`,
          write: {
            ...contractConfig.distributor,
            functionName: "claimReward",
            args: [contentId, roundId],
          },
        });
      }
    }

    if (vote.isUp !== vote.roundUpWins) {
      continue;
    }

    const [
      participationClaimed,
      alreadyPaid,
      rateBps,
      totalReward,
      reservedReward,
      rewardPool,
    ] = (await Promise.all([
      publicClient.readContract({
        ...contractConfig.distributor,
        functionName: "participationRewardClaimed",
        args: [contentId, roundId, address],
      }),
      publicClient.readContract({
        ...contractConfig.distributor,
        functionName: "participationRewardPaid",
        args: [contentId, roundId, address],
      }),
      publicClient.readContract({
        ...contractConfig.distributor,
        functionName: "roundParticipationRewardRateBps",
        args: [contentId, roundId],
      }),
      publicClient.readContract({
        ...contractConfig.distributor,
        functionName: "roundParticipationRewardOwed",
        args: [contentId, roundId],
      }),
      publicClient.readContract({
        ...contractConfig.distributor,
        functionName: "roundParticipationRewardReserved",
        args: [contentId, roundId],
      }),
      publicClient.readContract({
        ...contractConfig.distributor,
        functionName: "roundParticipationRewardPool",
        args: [contentId, roundId],
      }),
    ])) as readonly [boolean, bigint, bigint, bigint, bigint, `0x${string}`];

    if (participationClaimed || rewardPool === ZERO_ADDRESS || rateBps <= 0n || totalReward <= 0n) {
      continue;
    }

    const fullReward = (stake * rateBps) / 10000n;
    if (fullReward <= 0n) {
      continue;
    }

    const currentlyClaimable = reservedReward < totalReward ? (fullReward * reservedReward) / totalReward : fullReward;
    const claimableNow = currentlyClaimable > alreadyPaid ? currentlyClaimable - alreadyPaid : 0n;
    if (claimableNow <= 0n) {
      continue;
    }

    items.push({
      claimType: "participation_reward",
      contentId,
      roundId,
      estimatedReward: claimableNow,
      label: `bootstrap reward for content #${contentId} round #${roundId}`,
      write: {
        ...contractConfig.distributor,
        functionName: "claimParticipationReward",
        args: [contentId, roundId],
      },
    });
  }

  return sortClaimPlan(items);
}

async function buildSubmitterParticipationClaimItems(
  candidates: readonly SubmitterParticipationCandidate[],
): Promise<ClaimPlanItem[]> {
  const uniqueRewardPools = [...new Set(candidates.map(candidate => candidate.rewardPool).filter(Boolean))] as `0x${string}`[];
  const poolStates = new Map<`0x${string}`, ParticipationPoolClaimState>();

  for (const rewardPool of uniqueRewardPools) {
    const [authorized, poolBalance] = (await Promise.all([
      publicClient.readContract({
        address: rewardPool,
        abi: ParticipationPoolAbi,
        functionName: "authorizedCallers",
        args: [contractConfig.registry.address],
      }),
      publicClient.readContract({
        address: rewardPool,
        abi: ParticipationPoolAbi,
        functionName: "poolBalance",
        args: [],
      }),
    ])) as readonly [boolean, bigint];

    poolStates.set(rewardPool, {
      authorized,
      poolBalance,
    });
  }

  const availableStreamingByPool = new Map<`0x${string}`, bigint>();
  const items: ClaimPlanItem[] = [];

  for (const candidate of [...candidates].sort((left, right) => {
    const leftId = safeBigInt(left.content.id);
    const rightId = safeBigInt(right.content.id);
    if (leftId === rightId) {
      return 0;
    }
    return leftId < rightId ? -1 : 1;
  })) {
    const rewardPool = candidate.rewardPool;
    if (!rewardPool || candidate.totalReward <= candidate.alreadyPaid) {
      continue;
    }

    const reservedRemaining =
      candidate.reservedReward > candidate.alreadyPaid ? candidate.reservedReward - candidate.alreadyPaid : 0n;
    const remainingAfterReserved =
      candidate.totalReward > candidate.alreadyPaid + reservedRemaining
        ? candidate.totalReward - candidate.alreadyPaid - reservedRemaining
        : 0n;

    const poolState = poolStates.get(rewardPool);
    const initialStreamingBalance = poolState?.authorized ? poolState.poolBalance : 0n;
    const streamingBalance = availableStreamingByPool.has(rewardPool)
      ? availableStreamingByPool.get(rewardPool)!
      : initialStreamingBalance;
    const streamedReward = remainingAfterReserved > streamingBalance ? streamingBalance : remainingAfterReserved;
    availableStreamingByPool.set(rewardPool, streamingBalance - streamedReward);

    const claimableReward = reservedRemaining + streamedReward;
    if (claimableReward <= 0n) {
      continue;
    }

    const contentId = safeBigInt(candidate.content.id);
    items.push({
      claimType: "submitter_participation_reward",
      contentId,
      estimatedReward: claimableReward,
      label: `submitter bootstrap reward for content #${contentId}`,
      write: {
        ...contractConfig.registry,
        functionName: "claimSubmitterParticipationReward",
        args: [contentId],
      },
    });
  }

  return items;
}

async function buildSubmitBotClaimPlan(address: `0x${string}`): Promise<ClaimPlanItem[]> {
  const contentItems = await ponder.getAllContent({ submitter: address, status: "all" });
  const items: ClaimPlanItem[] = [];
  const participationCandidates: SubmitterParticipationCandidate[] = [];

  for (const content of contentItems) {
    const contentId = safeBigInt(content.id);
    if (contentId <= 0n) {
      continue;
    }

    if (content.totalRounds > 0) {
      const settledRounds = await ponder.getAllRounds({
        contentId: content.id,
        state: String(ROUND_STATE.Settled),
      });

      for (const round of settledRounds) {
        const roundId = safeBigInt(round.roundId);
        if (roundId <= 0n) {
          continue;
        }

        const [pendingReward, alreadyClaimed] = (await Promise.all([
          publicClient.readContract({
            ...contractConfig.votingEngine,
            functionName: "pendingSubmitterReward",
            args: [contentId, roundId],
          }),
          publicClient.readContract({
            ...contractConfig.distributor,
            functionName: "submitterRewardClaimed",
            args: [contentId, roundId],
          }),
        ])) as readonly [bigint, boolean];

        if (pendingReward <= 0n || alreadyClaimed) {
          continue;
        }

        items.push({
          claimType: "submitter_reward",
          contentId,
          roundId,
          estimatedReward: pendingReward,
          label: `submitter round reward for content #${contentId} round #${roundId}`,
          write: {
            ...contractConfig.distributor,
            functionName: "claimSubmitterReward",
            args: [contentId, roundId],
          },
        });
      }
    }

    if (!content.submitterStakeReturned) {
      continue;
    }

    const [totalReward, alreadyPaid, reservedReward, rewardPool] = (await Promise.all([
      publicClient.readContract({
        ...contractConfig.registry,
        functionName: "submitterParticipationRewardOwed",
        args: [contentId],
      }),
      publicClient.readContract({
        ...contractConfig.registry,
        functionName: "submitterParticipationRewardPaid",
        args: [contentId],
      }),
      publicClient.readContract({
        ...contractConfig.registry,
        functionName: "submitterParticipationRewardReserved",
        args: [contentId],
      }),
      publicClient.readContract({
        ...contractConfig.registry,
        functionName: "submitterParticipationRewardPool",
        args: [contentId],
      }),
    ])) as readonly [bigint, bigint, bigint, `0x${string}`];

    participationCandidates.push({
      content,
      totalReward,
      alreadyPaid,
      reservedReward,
      rewardPool: rewardPool !== ZERO_ADDRESS ? rewardPool : null,
    });
  }

  const participationItems = await buildSubmitterParticipationClaimItems(participationCandidates);
  return sortClaimPlan([...items, ...participationItems]);
}

async function executeClaimPlan(
  roleLabel: string,
  wallet: ReturnType<typeof getWalletClient>,
  items: readonly ClaimPlanItem[],
) {
  if (items.length === 0) {
    log.info(`No claimable rewards found for ${roleLabel}.`);
    return;
  }

  const estimatedTotal = items.reduce((sum, item) => sum + item.estimatedReward, 0n);
  log.info(`Found ${items.length} claim(s) for ${roleLabel} worth about ${formatCrepAmount(estimatedTotal)}.`);

  let claimedCount = 0;
  let claimedEstimate = 0n;

  for (const item of items) {
    try {
      log.info(`Claiming ${item.label} (${formatCrepAmount(item.estimatedReward)})...`);
      const hash = await wallet.writeContract(item.write as any);
      await waitForClaimReceipt(hash, item.label);
      claimedCount += 1;
      claimedEstimate += item.estimatedReward;
      log.info(`Claimed ${item.label}: ${hash}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`Failed to claim ${item.label}: ${message}`);
    }
  }

  if (claimedCount === 0) {
    log.info(`No rewards were claimed successfully for ${roleLabel}.`);
    return;
  }

  log.info(
    `Claim run complete for ${roleLabel}: ${claimedCount}/${items.length} claim(s) succeeded, about ${formatCrepAmount(claimedEstimate)} requested.`,
  );
}

async function runClaimForRole(role: BotRole): Promise<void> {
  const identity = getIdentityConfig(role);
  const roleLabel = role === "submit" ? "submission bot" : "rating bot";

  let account: ReturnType<typeof getAccount>;
  try {
    account = getAccount(identity);
  } catch (error) {
    log.info(`Skipping ${roleLabel} claims: wallet not configured.`);
    return;
  }

  try {
    await validateContractKeys(configuredContractKeysForClaim(role));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Cannot run ${roleLabel} claims: ${message}`);
    return;
  }

  const wallet = getWalletClient(identity, account);
  log.info(`${role === "submit" ? "Submission" : "Rating"} bot claim address: ${account.address}`);

  const items = role === "submit" ? await buildSubmitBotClaimPlan(account.address) : await buildRateBotClaimPlan(account.address);
  await executeClaimPlan(roleLabel, wallet, items);
}

export async function runClaim() {
  if (!config.ponderUrl) {
    log.error("PONDER_URL is required to discover claimable bot rewards.");
    return;
  }

  if (!(await ponder.isAvailable())) {
    log.error("Ponder indexer is not available. Start it with: yarn ponder:dev");
    return;
  }

  await runClaimForRole("submit");
  await runClaimForRole("rate");
}
