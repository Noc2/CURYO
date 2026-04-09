import deployedContracts from "@curyo/contracts/deployedContracts";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { type Abi, type Address, createPublicClient, http, isAddress } from "viem";
import { getPrimaryServerTargetNetwork, getServerRpcOverrides, getServerTargetNetworkById } from "~~/lib/env/server";
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
const CLAIMABLE_FRONTEND_FEES_CACHE_TTL_MS = 60_000;

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

type FrontendFeeReadContext = {
  publicClient: {
    multicall: (...args: any[]) => Promise<any>;
    readContract: (...args: any[]) => Promise<any>;
  };
  rewardDistributor: {
    abi: Abi;
    address: Address;
  };
  votingEngine: {
    abi: Abi;
    address: Address;
  };
};

function normalizeFrontendAddress(frontend: string): `0x${string}` {
  return frontend.toLowerCase() as `0x${string}`;
}

function buildFrontendFeeSnapshotCacheKey(frontend: `0x${string}`, chainId: number) {
  return `${chainId}:${frontend}`;
}

function resolveFrontendFeeReadContext(chainId: number): FrontendFeeReadContext | null {
  const targetNetwork = getServerTargetNetworkById(chainId);
  if (!targetNetwork) {
    return null;
  }

  const contractsForChain = (deployedContracts as unknown as Partial<DeployedContractsMap>)[targetNetwork.id];
  const votingEngine = contractsForChain?.RoundVotingEngine;
  const rewardDistributor = contractsForChain?.RoundRewardDistributor;
  const rpcOverrides = getServerRpcOverrides();
  const rpcUrl = rpcOverrides?.[targetNetwork.id] ?? targetNetwork.rpcUrls.default.http[0];

  if (!votingEngine || !rewardDistributor || !rpcUrl) {
    return null;
  }

  return {
    publicClient: createPublicClient({
      chain: targetNetwork,
      transport: http(rpcUrl),
    }),
    rewardDistributor,
    votingEngine,
  };
}

function isPonderNotFoundError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("404");
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

export function normalizeFrontendFeeDisposition(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number" && Number.isInteger(value)) {
    return BigInt(value);
  }
  return 2n;
}

export function isClaimableFrontendFeeSnapshot(claimableFee: bigint, disposition: unknown, alreadyClaimed: boolean) {
  const normalizedDisposition = normalizeFrontendFeeDisposition(disposition);
  return !alreadyClaimed && claimableFee > 0n && normalizedDisposition !== 2n;
}

async function readFrontendFeeBatch(
  frontend: `0x${string}`,
  rounds: PonderRoundItem[],
  context: FrontendFeeReadContext | null,
) {
  if (!context || rounds.length === 0) {
    return rounds.map(() => ({
      totalFrontendPool: 0n,
      frontendStake: 0n,
      totalEligibleStake: 0n,
      totalFrontendClaimants: 0n,
      claimableFee: 0n,
      disposition: 2n,
      operator: "0x0000000000000000000000000000000000000000" as Address,
      alreadyClaimed: false,
    }));
  }

  const contracts = rounds.flatMap(item => {
    const contentId = BigInt(item.contentId);
    const roundId = BigInt(item.roundId);

    return [
      {
        address: context.votingEngine.address,
        abi: context.votingEngine.abi,
        functionName: "roundFrontendPool" as const,
        args: [contentId, roundId],
      },
      {
        address: context.votingEngine.address,
        abi: context.votingEngine.abi,
        functionName: "roundPerFrontendStake" as const,
        args: [contentId, roundId, frontend],
      },
      {
        address: context.votingEngine.address,
        abi: context.votingEngine.abi,
        functionName: "roundStakeWithEligibleFrontend" as const,
        args: [contentId, roundId],
      },
      {
        address: context.votingEngine.address,
        abi: context.votingEngine.abi,
        functionName: "roundEligibleFrontendCount" as const,
        args: [contentId, roundId],
      },
      {
        address: context.rewardDistributor.address,
        abi: context.rewardDistributor.abi,
        functionName: "previewFrontendFee" as const,
        args: [contentId, roundId, frontend],
      },
    ];
  });

  const emptyRow = {
    totalFrontendPool: 0n,
    frontendStake: 0n,
    totalEligibleStake: 0n,
    totalFrontendClaimants: 0n,
    claimableFee: 0n,
    disposition: 2n,
    operator: "0x0000000000000000000000000000000000000000" as Address,
    alreadyClaimed: false,
  };

  try {
    const results = await context.publicClient.multicall({
      allowFailure: true,
      contracts,
    });

    return rounds.map((_, index) => {
      const totalFrontendPoolResult = results[index * 5];
      const frontendStakeResult = results[index * 5 + 1];
      const totalEligibleStakeResult = results[index * 5 + 2];
      const totalFrontendClaimantsResult = results[index * 5 + 3];
      const previewResult = results[index * 5 + 4];
      const previewTuple =
        previewResult?.status === "success" && Array.isArray(previewResult.result) ? previewResult.result : null;

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
        claimableFee: previewTuple && typeof previewTuple[0] === "bigint" ? previewTuple[0] : 0n,
        disposition: previewTuple ? normalizeFrontendFeeDisposition(previewTuple[1]) : 2n,
        operator:
          previewTuple && typeof previewTuple[2] === "string" ? (previewTuple[2] as Address) : emptyRow.operator,
        alreadyClaimed: previewTuple && typeof previewTuple[3] === "boolean" ? previewTuple[3] : false,
      };
    });
  } catch {
    const rows = [];

    for (const item of rounds) {
      const contentId = BigInt(item.contentId);
      const roundId = BigInt(item.roundId);

      try {
        const [totalFrontendPool, frontendStake, totalEligibleStake, totalFrontendClaimants, previewFrontendFee] =
          await Promise.all([
            context.publicClient.readContract({
              address: context.votingEngine.address,
              abi: context.votingEngine.abi,
              functionName: "roundFrontendPool",
              args: [contentId, roundId],
            }) as Promise<bigint>,
            context.publicClient.readContract({
              address: context.votingEngine.address,
              abi: context.votingEngine.abi,
              functionName: "roundPerFrontendStake",
              args: [contentId, roundId, frontend],
            }) as Promise<bigint>,
            context.publicClient.readContract({
              address: context.votingEngine.address,
              abi: context.votingEngine.abi,
              functionName: "roundStakeWithEligibleFrontend",
              args: [contentId, roundId],
            }) as Promise<bigint>,
            context.publicClient.readContract({
              address: context.votingEngine.address,
              abi: context.votingEngine.abi,
              functionName: "roundEligibleFrontendCount",
              args: [contentId, roundId],
            }) as Promise<bigint>,
            context.publicClient.readContract({
              address: context.rewardDistributor.address,
              abi: context.rewardDistributor.abi,
              functionName: "previewFrontendFee",
              args: [contentId, roundId, frontend],
            }) as Promise<[bigint, bigint | number, Address, boolean]>,
          ]);

        const [claimableFee, disposition, operator, alreadyClaimed] = previewFrontendFee;

        rows.push({
          totalFrontendPool,
          frontendStake,
          totalEligibleStake,
          totalFrontendClaimants,
          claimableFee,
          disposition: normalizeFrontendFeeDisposition(disposition),
          operator,
          alreadyClaimed,
        });
      } catch {
        rows.push(emptyRow);
      }
    }

    return rows;
  }
}

async function buildClaimableFrontendFeeSnapshot(
  frontend: `0x${string}`,
  chainId: number,
): Promise<ClaimableFrontendFeeSnapshot> {
  const context = resolveFrontendFeeReadContext(chainId);
  if (!context) {
    return emptySnapshot();
  }

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

  if (!frontendRecord) {
    return emptySnapshot();
  }

  const items: ClaimableFrontendFeeRound[] = [];
  let scanOffset = 0;
  let scannedRounds = 0;
  let totalRounds = 0;

  while (true) {
    const batchSize = MAX_SCAN_BATCH;
    const page = await ponderApi.getRounds({
      state: String(ROUND_STATE.Settled),
      limit: String(batchSize),
      offset: String(scanOffset),
    });

    totalRounds = page.total;
    if (page.items.length === 0) {
      break;
    }

    const feeRows = await readFrontendFeeBatch(frontend, page.items, context);

    for (let index = 0; index < page.items.length; index++) {
      const round = page.items[index];
      const row = feeRows[index];
      scanOffset += 1;
      scannedRounds += 1;

      if (!isClaimableFrontendFeeSnapshot(row.claimableFee, row.disposition, row.alreadyClaimed)) {
        continue;
      }

      items.push({
        contentId: round.contentId,
        roundId: round.roundId,
        title: round.title,
        description: round.description,
        url: round.url,
        settledAt: round.settledAt,
        claimableFee: row.claimableFee.toString(),
        totalFrontendPool: row.totalFrontendPool.toString(),
        frontendStake: row.frontendStake.toString(),
        totalEligibleStake: row.totalEligibleStake.toString(),
        totalFrontendClaimants: Number(row.totalFrontendClaimants),
      });
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

async function getClaimableFrontendFeeSnapshot(
  frontend: `0x${string}`,
  chainId: number,
): Promise<ClaimableFrontendFeeSnapshot> {
  const cacheKey = buildFrontendFeeSnapshotCacheKey(frontend, chainId);
  const cachedSnapshot = frontendFeeSnapshotCache.get(cacheKey);
  if (cachedSnapshot && Date.now() - cachedSnapshot.fetchedAt < CLAIMABLE_FRONTEND_FEES_CACHE_TTL_MS) {
    return cachedSnapshot;
  }

  const existingPromise = frontendFeeSnapshotPromises.get(cacheKey);
  if (existingPromise) {
    return cachedSnapshot ?? existingPromise;
  }

  const refreshPromise = buildClaimableFrontendFeeSnapshot(frontend, chainId)
    .then(snapshot => {
      frontendFeeSnapshotCache.set(cacheKey, snapshot);
      return snapshot;
    })
    .finally(() => {
      frontendFeeSnapshotPromises.delete(cacheKey);
    });

  frontendFeeSnapshotPromises.set(cacheKey, refreshPromise);

  if (cachedSnapshot) {
    void refreshPromise;
    return cachedSnapshot;
  }

  return refreshPromise;
}

export async function listClaimableFrontendFeeRounds(
  frontend: string,
  params: { chainId?: number; limit?: number; offset?: number } = {},
): Promise<ClaimableFrontendFeeResponse> {
  const resolvedChainId = params.chainId ?? getPrimaryServerTargetNetwork()?.id;
  const limit = Math.min(Math.max(params.limit ?? 10, 1), 50);
  const initialOffset = Math.max(params.offset ?? 0, 0);

  if (!isAddress(frontend) || !Number.isFinite(resolvedChainId)) {
    return toClaimableFeePage(emptySnapshot(), initialOffset, limit);
  }

  const normalizedFrontend = normalizeFrontendAddress(frontend);
  const snapshot = await getClaimableFrontendFeeSnapshot(normalizedFrontend, resolvedChainId!);
  return toClaimableFeePage(snapshot, initialOffset, limit);
}
