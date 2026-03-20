interface LeaderboardProfile {
  username?: string | null;
}

interface RankVoterLeaderboardAddressesParams {
  candidateAddresses: string[];
  balances: Record<string, bigint | undefined>;
  limit: number;
  includeAddress: string | null;
}

interface BuildVoterLeaderboardEntriesParams {
  rankedAddresses: string[];
  selectedAddresses: string[];
  balances: Record<string, bigint | undefined>;
  profiles: Record<string, LeaderboardProfile | undefined>;
}

export function rankVoterLeaderboardAddresses({
  candidateAddresses,
  balances,
  limit,
  includeAddress,
}: RankVoterLeaderboardAddressesParams) {
  const normalizedIncludeAddress = includeAddress?.toLowerCase() ?? null;
  const normalizedAddresses = [...new Set(candidateAddresses.map(address => address.toLowerCase()))];

  const rankedAddresses = normalizedAddresses
    .filter(address => address === normalizedIncludeAddress || (balances[address] ?? 0n) > 0n)
    .sort((left, right) => {
      const leftBalance = balances[left] ?? 0n;
      const rightBalance = balances[right] ?? 0n;
      if (rightBalance > leftBalance) return 1;
      if (rightBalance < leftBalance) return -1;
      return left.localeCompare(right);
    });

  const selectedAddresses = rankedAddresses.slice(0, limit);
  if (
    normalizedIncludeAddress &&
    !selectedAddresses.includes(normalizedIncludeAddress) &&
    rankedAddresses.includes(normalizedIncludeAddress)
  ) {
    selectedAddresses.push(normalizedIncludeAddress);
  }

  return {
    rankedAddresses,
    selectedAddresses,
    totalCount: rankedAddresses.length,
  };
}

export function buildVoterLeaderboardEntries({
  rankedAddresses,
  selectedAddresses,
  balances,
  profiles,
}: BuildVoterLeaderboardEntriesParams) {
  const ranks = new Map(rankedAddresses.map((address, index) => [address, index + 1]));
  const entries = selectedAddresses.map(address => ({
    rank: ranks.get(address) ?? 0,
    address,
    username: profiles[address]?.username ?? null,
    balance: (balances[address] ?? 0n).toString(),
  }));

  return {
    entries,
    totalCount: rankedAddresses.length,
  };
}
