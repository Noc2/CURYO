import deployedContracts from "@curyo/contracts/deployedContracts";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { type Abi, type Address, createPublicClient, http, isAddress } from "viem";
import { getPrimaryServerTargetNetwork, getServerRpcOverrides } from "~~/lib/env/server";
import { type PonderFrontend, type PonderRoundItem, isPonderAvailable, ponderApi } from "~~/services/ponder/client";

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
const CLAIMABLE_FRONTEND_FEES_CACHE_TTL_MS = 60_000;

const targetNetwork = getPrimaryServerTargetNetwork();
const contractsForChain = targetNetwork
  ? (deployedContracts as unknown as Partial<DeployedContractsMap>)[targetNetwork.id]
  : undefined;
const votingEngine = contractsForChain?.RoundVotingEngine;
const rewardDistributor = contractsForChain?.RoundRewardDistributor;
const rpcOverrides = getServerRpcOverrides();
const rpcUrl = targetNetwork ? (rpcOverrides?.[targetNetwork.id] ?? targetNetwork.rpcUrls.default.http[0]) : undefined;

const publicClient =
  targetNetwork && votingEngine && rewardDistributor && rpcUrl
    ? createPublicClient({
        chain: targetNetwork,
        transport: http(rpcUrl),
      })
    : null;

interface ClaimableFrontendFeeRound {
  contentId: string;
  roundId: string;
  title: string | null;
  description: string | null;
  url: string | null;
  settledAt: string | null;
  claimableFee: string;
  totalFrontendPool: string;
  frontendStake: string;
  totalEligibleStake: string;
  totalFrontendClaimants: number;
}

interface ClaimableFrontendFeeResponse {
  items: ClaimableFrontendFeeRound[];
  hasMore: boolean;
  nextOffset: number;
  scannedRounds: number;
  totalRounds: number;
}

interface ClaimableFrontendFeeSnapshot {
  fetchedAt: number;
  items: ClaimableFrontendFeeRound[];
  scannedRounds: number;
  totalRounds: number;
}

const emptySnapshot = (): ClaimableFrontendFeeSnapshot => ({
  fetchedAt: Date.now(),
  items: [],
  scannedRounds: 0,
  totalRounds: 0,
});

const frontendFeeSnapshotCache = new Map<string, ClaimableFrontendFeeSnapshot>();
const frontendFeeSnapshotPromises = new Map<string, Promise<ClaimableFrontendFeeSnapshot>>();

function normalizeFrontendAddress(frontend: string): `0x${string}` {
  return frontend.toLowerCase() as `0x${string}`;
}

function isPonderNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("404");
}

function hasOutstandingFrontendFees(frontend: PonderFrontend): boolean {
  return BigInt(frontend.totalFeesCredited) > BigInt(frontend.totalFeesClaimed);
}

function toClaimableFeePage(
  snapshot: ClaimableFrontendFeeSnapshot,
  offset: number,
  limit: number,
): ClaimableFrontendFeeResponse {
  const items = snapshot.items.slice(offset, offset + limit);
  const nextOffset = offset + items.length;

  return {
    items,
    hasMore: nextOffset < snapshot.items.length,
    nextOffset,
    scannedRounds: snapshot.scannedRounds,
    totalRounds: snapshot.totalRounds,
  };
}

function isClaimableSnapshot(
  totalFrontendPool: bigint,
  frontendStake: bigint,
  totalEligibleStake: bigint,
  totalFrontendClaimants: bigint,
  alreadyClaimed: boolean,
) {
  return (
    !alreadyClaimed &&
    totalFrontendPool > 0n &&
    frontendStake > 0n &&
    totalEligibleStake > 0n &&
    totalFrontendClaimants > 0n
  );
}

function calculateClaimableFee(
  totalFrontendPool: bigint,
  frontendStake: bigint,
  totalEligibleStake: bigint,
  totalFrontendClaimants: bigint,
  claimedCount: bigint,
  claimedAmount: bigint,
) {
  if (claimedCount + 1n === totalFrontendClaimants) {
    return totalFrontendPool - claimedAmount;
  }

  return (totalFrontendPool * frontendStake) / totalEligibleStake;
}

async function readFrontendFeeBatch(frontend: `0x${string}`, rounds: PonderRoundItem[]) {
  if (!publicClient || !votingEngine || !rewardDistributor || rounds.length === 0) {
    return rounds.map(() => ({
      totalFrontendPool: 0n,
      frontendStake: 0n,
      totalEligibleStake: 0n,
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
        functionName: "roundFrontendPool" as const,
        args: [contentId, roundId],
      },
      {
        address: votingEngine.address,
        abi: votingEngine.abi,
        functionName: "roundPerFrontendStake" as const,
        args: [contentId, roundId, frontend],
      },
      {
        address: votingEngine.address,
        abi: votingEngine.abi,
        functionName: "roundStakeWithEligibleFrontend" as const,
        args: [contentId, roundId],
      },
      {
        address: votingEngine.address,
        abi: votingEngine.abi,
        functionName: "roundEligibleFrontendCount" as const,
        args: [contentId, roundId],
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
    totalEligibleStake: 0n,
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
      const totalFrontendPoolResult = results[index * 7];
      const frontendStakeResult = results[index * 7 + 1];
      const totalEligibleStakeResult = results[index * 7 + 2];
      const totalFrontendClaimantsResult = results[index * 7 + 3];
      const claimedResult = results[index * 7 + 4];
      const claimedCountResult = results[index * 7 + 5];
      const claimedAmountResult = results[index * 7 + 6];

      return {
        totalFrontendPool:
          totalFrontendPoolResult?.status === "success" && typeof totalFrontendPoolResult.result === "bigint"
            ? totalFrontendPoolResult.result
            : 0n,
        frontendStake:
          frontendStakeResult?.status === "success" && typeof frontendStakeResult.result === "bigint"
            ? frontendStakeResult.result
            : 0n,
        totalEligibleStake:
          totalEligibleStakeResult?.status === "success" && typeof totalEligibleStakeResult.result === "bigint"
            ? totalEligibleStakeResult.result
            : 0n,
        totalFrontendClaimants:
          totalFrontendClaimantsResult?.status === "success" && typeof totalFrontendClaimantsResult.result === "bigint"
            ? totalFrontendClaimantsResult.result
            : 0n,
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
        const [
          totalFrontendPool,
          frontendStake,
          totalEligibleStake,
          totalFrontendClaimants,
          alreadyClaimed,
          claimedCount,
          claimedAmount,
        ] = await Promise.all([
          publicClient.readContract({
            address: votingEngine.address,
            abi: votingEngine.abi,
            functionName: "roundFrontendPool",
            args: [contentId, roundId],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: votingEngine.address,
            abi: votingEngine.abi,
            functionName: "roundPerFrontendStake",
            args: [contentId, roundId, frontend],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: votingEngine.address,
            abi: votingEngine.abi,
            functionName: "roundStakeWithEligibleFrontend",
            args: [contentId, roundId],
          }) as Promise<bigint>,
          publicClient.readContract({
            address: votingEngine.address,
            abi: votingEngine.abi,
            functionName: "roundEligibleFrontendCount",
            args: [contentId, roundId],
          }) as Promise<bigint>,
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
          totalFrontendPool,
          frontendStake,
          totalEligibleStake,
          totalFrontendClaimants,
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

async function buildClaimableFrontendFeeSnapshot(frontend: `0x${string}`): Promise<ClaimableFrontendFeeSnapshot> {
  if (!(await isPonderAvailable())) {
    return emptySnapshot();
  }

  let frontendRecord: PonderFrontend | null = null;
  try {
    frontendRecord = (await ponderApi.getFrontend(frontend)).frontend;
  } catch (error) {
    if (isPonderNotFoundError(error)) {
      return emptySnapshot();
    }

    throw error;
  }

  if (!frontendRecord || !hasOutstandingFrontendFees(frontendRecord)) {
    return emptySnapshot();
  }

  const items: ClaimableFrontendFeeRound[] = [];
  let scanOffset = 0;
  let scannedRounds = 0;
  let totalRounds = 0;

  while (scannedRounds < MAX_SCAN_ROUNDS) {
    const batchSize = Math.min(MAX_SCAN_BATCH, MAX_SCAN_ROUNDS - scannedRounds);
    const page = await ponderApi.getRounds({
      state: String(ROUND_STATE.Settled),
      limit: String(batchSize),
      offset: String(scanOffset),
    });

    totalRounds = page.total;
    if (page.items.length === 0) {
      break;
    }

    const feeRows = await readFrontendFeeBatch(frontend, page.items);

    for (let index = 0; index < page.items.length; index++) {
      const round = page.items[index];
      const row = feeRows[index];
      scanOffset += 1;
      scannedRounds += 1;

      if (
        !isClaimableSnapshot(
          row.totalFrontendPool,
          row.frontendStake,
          row.totalEligibleStake,
          row.totalFrontendClaimants,
          row.alreadyClaimed,
        )
      ) {
        if (scannedRounds >= MAX_SCAN_ROUNDS) break;
        continue;
      }

      const claimableFee = calculateClaimableFee(
        row.totalFrontendPool,
        row.frontendStake,
        row.totalEligibleStake,
        row.totalFrontendClaimants,
        row.claimedCount,
        row.claimedAmount,
      );

      if (claimableFee <= 0n) {
        if (scannedRounds >= MAX_SCAN_ROUNDS) break;
        continue;
      }

      items.push({
        contentId: round.contentId,
        roundId: round.roundId,
        title: round.title,
        description: round.description,
        url: round.url,
        settledAt: round.settledAt,
        claimableFee: claimableFee.toString(),
        totalFrontendPool: row.totalFrontendPool.toString(),
        frontendStake: row.frontendStake.toString(),
        totalEligibleStake: row.totalEligibleStake.toString(),
        totalFrontendClaimants: Number(row.totalFrontendClaimants),
      });

      if (scannedRounds >= MAX_SCAN_ROUNDS) {
        break;
      }
    }

    if (page.items.length < batchSize || scanOffset >= page.total) {
      break;
    }
  }

  return {
    fetchedAt: Date.now(),
    items,
    scannedRounds,
    totalRounds,
  };
}

async function getClaimableFrontendFeeSnapshot(frontend: `0x${string}`): Promise<ClaimableFrontendFeeSnapshot> {
  const cachedSnapshot = frontendFeeSnapshotCache.get(frontend);
  if (cachedSnapshot && Date.now() - cachedSnapshot.fetchedAt < CLAIMABLE_FRONTEND_FEES_CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const existingPromise = frontendFeeSnapshotPromises.get(frontend);
  if (existingPromise) {
    return cachedSnapshot ?? existingPromise;
  }

  const refreshPromise = buildClaimableFrontendFeeSnapshot(frontend)
    .then(snapshot => {
      frontendFeeSnapshotCache.set(frontend, snapshot);
      return snapshot;
    })
    .finally(() => {
      frontendFeeSnapshotPromises.delete(frontend);
    });

  frontendFeeSnapshotPromises.set(frontend, refreshPromise);

  if (cachedSnapshot) {
    void refreshPromise;
    return cachedSnapshot;
  }

  return refreshPromise;
}

export async function listClaimableFrontendFeeRounds(
  frontend: string,
  params: { limit?: number; offset?: number } = {},
): Promise<ClaimableFrontendFeeResponse> {
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
  const initialOffset = Math.max(params.offset ?? 0, 0);

  if (!isAddress(frontend) || !publicClient || !votingEngine || !rewardDistributor) {
    return toClaimableFeePage(emptySnapshot(), initialOffset, limit);
  }

  const normalizedFrontend = normalizeFrontendAddress(frontend);
  const snapshot = await getClaimableFrontendFeeSnapshot(normalizedFrontend);
  return toClaimableFeePage(snapshot, initialOffset, limit);
}
