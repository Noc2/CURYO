import type { Account, Chain, PublicClient, WalletClient } from "viem";
import { ContentRegistryAbi, FrontendRegistryAbi, RoundRewardDistributorAbi } from "@curyo/contracts/abis";
import { config } from "./config.js";
import { readCurrentRoundIds, readRound, RoundState } from "./contract-reads.js";
import { writeContractAndConfirm } from "./keeper.js";
import type { Logger } from "./logger.js";
import { getRevertReason } from "./revert-utils.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
const PROTOCOL_FRONTEND_FEE_DISPOSITION = 2;

export interface FrontendFeeSweepResult {
  frontendAddress: `0x${string}`;
  roundsClaimed: number;
  withdrawals: number;
  withdrawnAmount: bigint;
}

export async function claimConfiguredFrontendFees(
  publicClient: PublicClient,
  walletClient: WalletClient,
  chain: Chain,
  account: Account,
  logger: Logger,
): Promise<FrontendFeeSweepResult> {
  const frontendAddress = (config.frontendFees.frontendAddress ?? account.address) as `0x${string}`;
  const contracts = config.frontendFees.contracts;

  if (!config.frontendFees.enabled || !contracts) {
    return {
      frontendAddress,
      roundsClaimed: 0,
      withdrawals: 0,
      withdrawnAmount: 0n,
    };
  }

  if (frontendAddress.toLowerCase() !== account.address.toLowerCase()) {
    logger.warn("Skipping frontend fee sweep because keeper wallet is not the configured frontend operator", {
      frontendAddress,
      account: account.address,
    });
    return {
      frontendAddress,
      roundsClaimed: 0,
      withdrawals: 0,
      withdrawnAmount: 0n,
    };
  }

  let nextContentId: bigint;
  try {
    nextContentId = (await publicClient.readContract({
      address: config.contracts.contentRegistry,
      abi: ContentRegistryAbi,
      functionName: "nextContentId",
      args: [],
    })) as bigint;
  } catch (error: unknown) {
    logger.warn("Failed to load content count for frontend fee sweep", {
      error: getRevertReason(error),
    });
    return {
      frontendAddress,
      roundsClaimed: 0,
      withdrawals: 0,
      withdrawnAmount: 0n,
    };
  }

  let roundsClaimed = 0;
  const lookbackRounds = BigInt(config.frontendFees.lookbackRounds);

  for (let contentId = 1n; contentId < nextContentId; contentId++) {
    let latestRoundId: bigint;
    try {
      ({ latestRoundId } = await readCurrentRoundIds(publicClient, config.contracts.votingEngine, contentId));
    } catch {
      continue;
    }

    if (latestRoundId === 0n) {
      continue;
    }

    const startRoundId = latestRoundId > lookbackRounds ? latestRoundId - lookbackRounds + 1n : 1n;

    for (let roundId = startRoundId; roundId <= latestRoundId; roundId++) {
      try {
        const round = await readRound(publicClient, config.contracts.votingEngine, contentId, roundId);
        if (round.state !== RoundState.Settled) {
          continue;
        }

        const [fee, disposition, operator, alreadyClaimed] = (await publicClient.readContract({
          address: contracts.roundRewardDistributor,
          abi: RoundRewardDistributorAbi,
          functionName: "previewFrontendFee",
          args: [contentId, roundId, frontendAddress],
        })) as readonly [bigint, number, `0x${string}`, boolean];

        if (fee === 0n || alreadyClaimed || disposition === PROTOCOL_FRONTEND_FEE_DISPOSITION) {
          continue;
        }

        if (operator !== ZERO_ADDRESS && operator.toLowerCase() !== account.address.toLowerCase()) {
          logger.warn("Skipping frontend fee claim because preview operator does not match keeper wallet", {
            contentId: Number(contentId),
            roundId: Number(roundId),
            frontendAddress,
            operator,
            account: account.address,
          });
          continue;
        }

        await writeContractAndConfirm(publicClient, walletClient, {
          chain,
          account,
          address: contracts.roundRewardDistributor,
          abi: RoundRewardDistributorAbi,
          functionName: "claimFrontendFee",
          args: [contentId, roundId, frontendAddress],
        });
        roundsClaimed++;
      } catch (error: unknown) {
        logger.debug("Frontend fee preview/claim skipped", {
          contentId: Number(contentId),
          roundId: Number(roundId),
          error: getRevertReason(error),
        });
      }
    }
  }

  let withdrawals = 0;
  let withdrawnAmount = 0n;

  if (config.frontendFees.withdrawEnabled) {
    try {
      const accruedFees = (await publicClient.readContract({
        address: contracts.frontendRegistry,
        abi: FrontendRegistryAbi,
        functionName: "getAccumulatedFees",
        args: [frontendAddress],
      })) as bigint;

      if (accruedFees > 0n) {
        await writeContractAndConfirm(publicClient, walletClient, {
          chain,
          account,
          address: contracts.frontendRegistry,
          abi: FrontendRegistryAbi,
          functionName: "claimFees",
          args: [],
        });
        withdrawals = 1;
        withdrawnAmount = accruedFees;
      }
    } catch (error: unknown) {
      logger.warn("Failed to withdraw accumulated frontend fees", {
        frontendAddress,
        error: getRevertReason(error),
      });
    }
  }

  return {
    frontendAddress,
    roundsClaimed,
    withdrawals,
    withdrawnAmount,
  };
}
