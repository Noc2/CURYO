import deployedContracts from "@curyo/contracts/deployedContracts";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { type Abi, type Address, createPublicClient, http, isAddress } from "viem";
import scaffoldConfig from "~~/scaffold.config";
import { type PonderRoundItem, ponderApi } from "~~/services/ponder/client";

type DeployedContractsMap = Record<
  number,
  Record<
    string,
    {
      address: Address;
      abi: Abi;
    }
  >
>;

const MAX_SCAN_BATCH = 100;
const MAX_SCAN_ROUNDS = 1000;

const targetNetwork = scaffoldConfig.targetNetworks[0];
const contractsForChain = (deployedContracts as unknown as Partial<DeployedContractsMap>)[targetNetwork.id];
const votingEngine = contractsForChain?.RoundVotingEngine;
const rewardDistributor = contractsForChain?.RoundRewardDistributor;
const rpcOverrides = scaffoldConfig.rpcOverrides as Partial<Record<number, string>> | undefined;
const rpcUrl = rpcOverrides?.[targetNetwork.id] ?? targetNetwork.rpcUrls.default.http[0];

const publicClient =
  votingEngine && rewardDistributor
    ? createPublicClient({
        chain: targetNetwork,
        transport: http(rpcUrl),
      })
    : null;

export interface ClaimableFrontendFeeRound {
  contentId: string;
  roundId: string;
  goal: string | null;
  url: string | null;
  settledAt: string | null;
  claimableFee: string;
  totalFrontendPool: string;
  frontendStake: string;
  totalApprovedStake: string;
  totalFrontendClaimants: number;
}

export interface ClaimableFrontendFeeResponse {
  items: ClaimableFrontendFeeRound[];
  hasMore: boolean;
  nextOffset: number;
  scannedRounds: number;
  totalRounds: number;
}

function normalizeFrontendAddress(frontend: string): `0x${string}` {
  return frontend.toLowerCase() as `0x${string}`;
}

function isClaimableSnapshot(
  totalFrontendPool: bigint,
  frontendStake: bigint,
  totalApprovedStake: bigint,
  totalFrontendClaimants: bigint,
  alreadyClaimed: boolean,
) {
  return (
    !alreadyClaimed &&
    totalFrontendPool > 0n &&
    frontendStake > 0n &&
    totalApprovedStake > 0n &&
    totalFrontendClaimants > 0n
  );
}

function calculateClaimableFee(
  totalFrontendPool: bigint,
  frontendStake: bigint,
  totalApprovedStake: bigint,
  totalFrontendClaimants: bigint,
  claimedCount: bigint,
  claimedAmount: bigint,
) {
  if (claimedCount + 1n === totalFrontendClaimants) {
    return totalFrontendPool - claimedAmount;
  }

  return (totalFrontendPool * frontendStake) / totalApprovedStake;
}

async function readFrontendFeeBatch(frontend: `0x${string}`, rounds: PonderRoundItem[]) {
  if (!publicClient || !votingEngine || !rewardDistributor || rounds.length === 0) {
    return rounds.map(() => ({
      totalFrontendPool: 0n,
      frontendStake: 0n,
      totalApprovedStake: 0n,
      totalFrontendClaimants: 0n,
      alreadyClaimed: false,
      claimedCount: 0n,
      claimedAmount: 0n,
    }));
  }

  const contracts = rounds.flatMap(item => {
    const contentId = BigInt(item.contentId);
    const roundId = BigInt(item.roundId);

    return [
      {
        address: votingEngine.address,
        abi: votingEngine.abi,
        functionName: "getFrontendFeeSnapshot" as const,
        args: [contentId, roundId, frontend],
      },
      {
        address: rewardDistributor.address,
        abi: rewardDistributor.abi,
        functionName: "frontendFeeClaimed" as const,
        args: [contentId, roundId, frontend],
      },
      {
        address: rewardDistributor.address,
        abi: rewardDistributor.abi,
        functionName: "roundFrontendClaimedCount" as const,
        args: [contentId, roundId],
      },
      {
        address: rewardDistributor.address,
        abi: rewardDistributor.abi,
        functionName: "roundFrontendClaimedAmount" as const,
        args: [contentId, roundId],
      },
    ];
  });

  const emptyRow = {
    totalFrontendPool: 0n,
    frontendStake: 0n,
    totalApprovedStake: 0n,
    totalFrontendClaimants: 0n,
    alreadyClaimed: false,
    claimedCount: 0n,
    claimedAmount: 0n,
  };

  try {
    const results = await publicClient.multicall({
      allowFailure: true,
      contracts,
    });

    return rounds.map((_, index) => {
      const snapshotResult = results[index * 4];
      const claimedResult = results[index * 4 + 1];
      const claimedCountResult = results[index * 4 + 2];
      const claimedAmountResult = results[index * 4 + 3];

      const snapshot =
        snapshotResult?.status === "success"
          ? (snapshotResult.result as readonly [bigint, bigint, bigint, bigint])
          : null;

      return {
        totalFrontendPool: snapshot?.[0] ?? 0n,
        frontendStake: snapshot?.[1] ?? 0n,
        totalApprovedStake: snapshot?.[2] ?? 0n,
        totalFrontendClaimants: snapshot?.[3] ?? 0n,
        alreadyClaimed: claimedResult?.status === "success" ? Boolean(claimedResult.result) : false,
        claimedCount:
          claimedCountResult?.status === "success" && typeof claimedCountResult.result === "bigint"
            ? claimedCountResult.result
            : 0n,
        claimedAmount:
          claimedAmountResult?.status === "success" && typeof claimedAmountResult.result === "bigint"
            ? claimedAmountResult.result
            : 0n,
      };
    });
  } catch {
    const rows = [];

    for (const item of rounds) {
      const contentId = BigInt(item.contentId);
      const roundId = BigInt(item.roundId);

      try {
        const [snapshot, alreadyClaimed, claimedCount, claimedAmount] = await Promise.all([
          publicClient.readContract({
            address: votingEngine.address,
            abi: votingEngine.abi,
            functionName: "getFrontendFeeSnapshot",
            args: [contentId, roundId, frontend],
          }) as Promise<readonly [bigint, bigint, bigint, bigint]>,
          publicClient.readContract({
            address: rewardDistributor.address,
            abi: rewardDistributor.abi,
            functionName: "frontendFeeClaimed",
            args: [contentId, roundId, frontend],
          }) as Promise<boolean>,
          publicClient.readContract({
            address: rewardDistributor.address,
            abi: rewardDistributor.abi,
            functionName: "roundFrontendClaimedCount",
            args: [contentId, roundId],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: rewardDistributor.address,
            abi: rewardDistributor.abi,
            functionName: "roundFrontendClaimedAmount",
            args: [contentId, roundId],
          }) as Promise<bigint>,
        ]);

        rows.push({
          totalFrontendPool: snapshot[0],
          frontendStake: snapshot[1],
          totalApprovedStake: snapshot[2],
          totalFrontendClaimants: snapshot[3],
          alreadyClaimed,
          claimedCount,
          claimedAmount,
        });
      } catch {
        rows.push(emptyRow);
      }
    }

    return rows;
  }
}

export async function listClaimableFrontendFeeRounds(
  frontend: string,
  params: { limit?: number; offset?: number } = {},
): Promise<ClaimableFrontendFeeResponse> {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
  const initialOffset = Math.max(params.offset ?? 0, 0);

  if (!isAddress(frontend) || !publicClient || !votingEngine || !rewardDistributor) {
    return {
      items: [],
      hasMore: false,
      nextOffset: initialOffset,
      scannedRounds: 0,
      totalRounds: 0,
    };
  }

  const normalizedFrontend = normalizeFrontendAddress(frontend);
  const items: ClaimableFrontendFeeRound[] = [];
  let nextOffset = initialOffset;
  let scannedRounds = 0;
  let totalRounds = 0;

  while (items.length < limit && scannedRounds < MAX_SCAN_ROUNDS) {
    const batchSize = Math.min(MAX_SCAN_BATCH, MAX_SCAN_ROUNDS - scannedRounds);
    const page = await ponderApi.getRounds({
      state: String(ROUND_STATE.Settled),
      limit: String(batchSize),
      offset: String(nextOffset),
    });

    totalRounds = page.total;
    if (page.items.length === 0) {
      break;
    }

    const feeRows = await readFrontendFeeBatch(normalizedFrontend, page.items);

    for (let index = 0; index < page.items.length; index++) {
      const round = page.items[index];
      const row = feeRows[index];
      nextOffset += 1;
      scannedRounds += 1;

      if (
        !isClaimableSnapshot(
          row.totalFrontendPool,
          row.frontendStake,
          row.totalApprovedStake,
          row.totalFrontendClaimants,
          row.alreadyClaimed,
        )
      ) {
        if (items.length >= limit || scannedRounds >= MAX_SCAN_ROUNDS) break;
        continue;
      }

      const claimableFee = calculateClaimableFee(
        row.totalFrontendPool,
        row.frontendStake,
        row.totalApprovedStake,
        row.totalFrontendClaimants,
        row.claimedCount,
        row.claimedAmount,
      );

      if (claimableFee <= 0n) {
        if (items.length >= limit || scannedRounds >= MAX_SCAN_ROUNDS) break;
        continue;
      }

      items.push({
        contentId: round.contentId,
        roundId: round.roundId,
        goal: round.goal,
        url: round.url,
        settledAt: round.settledAt,
        claimableFee: claimableFee.toString(),
        totalFrontendPool: row.totalFrontendPool.toString(),
        frontendStake: row.frontendStake.toString(),
        totalApprovedStake: row.totalApprovedStake.toString(),
        totalFrontendClaimants: Number(row.totalFrontendClaimants),
      });

      if (items.length >= limit || scannedRounds >= MAX_SCAN_ROUNDS) {
        break;
      }
    }

    if (page.items.length < batchSize || nextOffset >= page.total) {
      break;
    }
  }

  return {
    items,
    hasMore: nextOffset < totalRounds,
    nextOffset,
    scannedRounds,
    totalRounds,
  };
}
