import { rankVoterLeaderboardAddresses } from "./voterLeaderboard";
import "server-only";
import { getPrimaryServerTargetNetwork } from "~~/lib/env/server";
import { readHrepBalances } from "~~/lib/profileRegistry/server";
import { ponderApi } from "~~/services/ponder/client";

const VOTER_LEADERBOARD_CACHE_TTL_MS = 60_000;

export interface VoterLeaderboardSnapshot {
  balances: Record<string, bigint>;
  fetchedAt: number;
  rankedAddresses: string[];
  ranks: Record<string, number>;
  totalCount: number;
}

interface VoterLeaderboardSelection {
  balances: Record<string, bigint>;
  ranks: Record<string, number>;
  selectedAddresses: string[];
  totalCount: number;
}

interface VoterLeaderboardDeps {
  cacheTtlMs: number;
  chainId: number | null;
  listTokenHolders: typeof ponderApi.getAllTokenHolders;
  now: () => number;
  readBalances: typeof readHrepBalances;
}

const cachedSnapshots = new Map<string, VoterLeaderboardSnapshot>();
const refreshPromises = new Map<string, Promise<VoterLeaderboardSnapshot>>();

function getDeps(overrides: Partial<VoterLeaderboardDeps> = {}): VoterLeaderboardDeps {
  return {
    cacheTtlMs: overrides.cacheTtlMs ?? VOTER_LEADERBOARD_CACHE_TTL_MS,
    chainId: overrides.chainId ?? getPrimaryServerTargetNetwork()?.id ?? null,
    listTokenHolders: overrides.listTokenHolders ?? ponderApi.getAllTokenHolders.bind(ponderApi),
    now: overrides.now ?? Date.now,
    readBalances: overrides.readBalances ?? readHrepBalances,
  };
}

function buildSnapshotCacheKey(chainId: number | null) {
  return chainId === null ? "default" : String(chainId);
}

function buildRankIndex(rankedAddresses: string[]): Record<string, number> {
  return Object.fromEntries(rankedAddresses.map((address, index) => [address, index + 1]));
}

async function buildSnapshot(deps: VoterLeaderboardDeps): Promise<VoterLeaderboardSnapshot> {
  const holders = await deps.listTokenHolders();
  const candidateAddresses = [...new Set(holders.map(holder => holder.address.toLowerCase()))];
  const balances = await deps.readBalances(candidateAddresses, {
    chainId: deps.chainId ?? undefined,
  });
  const { rankedAddresses, totalCount } = rankVoterLeaderboardAddresses({
    candidateAddresses,
    balances,
    includeAddress: null,
    limit: candidateAddresses.length,
  });

  return {
    balances,
    fetchedAt: deps.now(),
    rankedAddresses,
    ranks: buildRankIndex(rankedAddresses),
    totalCount,
  };
}

async function refreshSnapshot(cacheKey: string, deps: VoterLeaderboardDeps): Promise<VoterLeaderboardSnapshot> {
  try {
    const snapshot = await buildSnapshot(deps);
    cachedSnapshots.set(cacheKey, snapshot);
    return snapshot;
  } finally {
    refreshPromises.delete(cacheKey);
  }
}

export async function getVoterLeaderboardSnapshot(
  overrides: Partial<VoterLeaderboardDeps> = {},
): Promise<VoterLeaderboardSnapshot> {
  const deps = getDeps(overrides);
  const now = deps.now();
  const cacheKey = buildSnapshotCacheKey(deps.chainId);
  const cachedSnapshot = cachedSnapshots.get(cacheKey) ?? null;
  const refreshPromise = refreshPromises.get(cacheKey) ?? null;

  if (cachedSnapshot && now - cachedSnapshot.fetchedAt < deps.cacheTtlMs) {
    return cachedSnapshot;
  }

  if (refreshPromise) {
    return cachedSnapshot ?? refreshPromise;
  }

  const nextRefreshPromise = refreshSnapshot(cacheKey, deps);
  refreshPromises.set(cacheKey, nextRefreshPromise);
  if (cachedSnapshot) {
    void nextRefreshPromise;
    return cachedSnapshot;
  }

  return nextRefreshPromise;
}

export async function resolveVoterLeaderboardSelection(
  snapshot: VoterLeaderboardSnapshot,
  params: {
    includeAddress: string | null;
    limit: number;
  },
  overrides: Partial<Pick<VoterLeaderboardDeps, "readBalances">> = {},
): Promise<VoterLeaderboardSelection> {
  const readBalances = overrides.readBalances ?? readHrepBalances;
  const selectedAddresses = snapshot.rankedAddresses.slice(0, params.limit);
  const balances: Record<string, bigint> = {};
  const ranks: Record<string, number> = {};

  for (const address of selectedAddresses) {
    balances[address] = snapshot.balances[address] ?? 0n;
    ranks[address] = snapshot.ranks[address] ?? 0;
  }

  const includeAddress = params.includeAddress?.toLowerCase() ?? null;
  if (!includeAddress) {
    return {
      balances,
      ranks,
      selectedAddresses,
      totalCount: snapshot.totalCount,
    };
  }

  if (snapshot.ranks[includeAddress] !== undefined) {
    if (!selectedAddresses.includes(includeAddress)) {
      selectedAddresses.push(includeAddress);
      balances[includeAddress] = snapshot.balances[includeAddress] ?? 0n;
      ranks[includeAddress] = snapshot.ranks[includeAddress];
    }

    return {
      balances,
      ranks,
      selectedAddresses,
      totalCount: snapshot.totalCount,
    };
  }

  const includeBalances = await readBalances([includeAddress]);
  const includeBalance = includeBalances[includeAddress] ?? 0n;
  const insertIndex = snapshot.rankedAddresses.findIndex(address => {
    const candidateBalance = snapshot.balances[address] ?? 0n;
    if (includeBalance > candidateBalance) return true;
    if (includeBalance === candidateBalance && includeAddress.localeCompare(address) < 0) return true;
    return false;
  });
  const rank = insertIndex === -1 ? snapshot.rankedAddresses.length + 1 : insertIndex + 1;

  balances[includeAddress] = includeBalance;
  ranks[includeAddress] = rank;

  if (rank <= params.limit) {
    const leadingAddresses = snapshot.rankedAddresses.slice(0, rank - 1);
    const trailingAddresses = snapshot.rankedAddresses.slice(rank - 1, params.limit - 1);
    const rebasedSelectedAddresses = [...leadingAddresses, includeAddress, ...trailingAddresses];

    for (const address of rebasedSelectedAddresses) {
      if (address === includeAddress) continue;
      balances[address] = snapshot.balances[address] ?? 0n;
      const baseRank = snapshot.ranks[address] ?? 0;
      ranks[address] = baseRank >= rank ? baseRank + 1 : baseRank;
    }

    return {
      balances,
      ranks,
      selectedAddresses: rebasedSelectedAddresses,
      totalCount: snapshot.totalCount + 1,
    };
  }

  selectedAddresses.push(includeAddress);

  return {
    balances,
    ranks,
    selectedAddresses,
    totalCount: snapshot.totalCount + 1,
  };
}

export function __resetVoterLeaderboardSnapshotForTests(): void {
  cachedSnapshots.clear();
  refreshPromises.clear();
}
