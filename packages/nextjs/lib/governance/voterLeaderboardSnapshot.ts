import "server-only";

import { readCRepBalances } from "~~/lib/profileRegistry/server";
import { ponderApi } from "~~/services/ponder/client";
import { rankVoterLeaderboardAddresses } from "./voterLeaderboard";

const VOTER_LEADERBOARD_CACHE_TTL_MS = 60_000;

export interface VoterLeaderboardSnapshot {
  balances: Record<string, bigint>;
  fetchedAt: number;
  rankedAddresses: string[];
  ranks: Record<string, number>;
  totalCount: number;
}

export interface VoterLeaderboardSelection {
  balances: Record<string, bigint>;
  ranks: Record<string, number>;
  selectedAddresses: string[];
  totalCount: number;
}

interface VoterLeaderboardDeps {
  cacheTtlMs: number;
  listTokenHolders: typeof ponderApi.getAllTokenHolders;
  now: () => number;
  readBalances: typeof readCRepBalances;
}

let cachedSnapshot: VoterLeaderboardSnapshot | null = null;
let refreshPromise: Promise<VoterLeaderboardSnapshot> | null = null;

function getDeps(overrides: Partial<VoterLeaderboardDeps> = {}): VoterLeaderboardDeps {
  return {
    cacheTtlMs: overrides.cacheTtlMs ?? VOTER_LEADERBOARD_CACHE_TTL_MS,
    listTokenHolders: overrides.listTokenHolders ?? ponderApi.getAllTokenHolders.bind(ponderApi),
    now: overrides.now ?? Date.now,
    readBalances: overrides.readBalances ?? readCRepBalances,
  };
}

function buildRankIndex(rankedAddresses: string[]): Record<string, number> {
  return Object.fromEntries(rankedAddresses.map((address, index) => [address, index + 1]));
}

async function buildSnapshot(deps: VoterLeaderboardDeps): Promise<VoterLeaderboardSnapshot> {
  const holders = await deps.listTokenHolders();
  const candidateAddresses = [...new Set(holders.map(holder => holder.address.toLowerCase()))];
  const balances = await deps.readBalances(candidateAddresses);
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

async function refreshSnapshot(deps: VoterLeaderboardDeps): Promise<VoterLeaderboardSnapshot> {
  try {
    const snapshot = await buildSnapshot(deps);
    cachedSnapshot = snapshot;
    return snapshot;
  } finally {
    refreshPromise = null;
  }
}

export async function getVoterLeaderboardSnapshot(
  overrides: Partial<VoterLeaderboardDeps> = {},
): Promise<VoterLeaderboardSnapshot> {
  const deps = getDeps(overrides);
  const now = deps.now();

  if (cachedSnapshot && now - cachedSnapshot.fetchedAt < deps.cacheTtlMs) {
    return cachedSnapshot;
  }

  if (refreshPromise) {
    return cachedSnapshot ?? refreshPromise;
  }

  refreshPromise = refreshSnapshot(deps);
  if (cachedSnapshot) {
    void refreshPromise;
    return cachedSnapshot;
  }

  return refreshPromise;
}

export async function resolveVoterLeaderboardSelection(
  snapshot: VoterLeaderboardSnapshot,
  params: {
    includeAddress: string | null;
    limit: number;
  },
  overrides: Partial<Pick<VoterLeaderboardDeps, "readBalances">> = {},
): Promise<VoterLeaderboardSelection> {
  const readBalances = overrides.readBalances ?? readCRepBalances;
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
  const insertIndex = snapshot.rankedAddresses.findIndex((address) => {
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
  cachedSnapshot = null;
  refreshPromise = null;
}
