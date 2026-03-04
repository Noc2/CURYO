"use client";

import { useEffect, useMemo, useState } from "react";
import { blo } from "blo";
import { Address } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { useDeployedContractInfo } from "~~/hooks/scaffold-eth";
import { useSubmitterProfiles } from "~~/hooks/useSubmitterProfiles";

interface LeaderboardUser {
  address: string;
  username: string | null;
  profileImageUrl: string | null;
}

interface LeaderboardEntry {
  rank: number;
  address: string;
  username: string | null;
  profileImageUrl: string | null;
  balance: bigint;
}

interface LeaderboardTableProps {
  /** Change this value to trigger a re-fetch of leaderboard data */
  refreshKey?: number;
}

export function LeaderboardTable({ refreshKey }: LeaderboardTableProps) {
  const { address: connectedAddress } = useAccount();
  const { data: tokenInfo } = useDeployedContractInfo({ contractName: "CuryoReputation" });

  const [users, setUsers] = useState<LeaderboardUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch users from API and include connected user
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await fetch("/api/leaderboard");
        if (!res.ok) throw new Error(`Leaderboard API returned ${res.status}`);
        const data = await res.json();
        let fetchedUsers: LeaderboardUser[] = data.users || [];

        // Always include the connected user if they're not already in the list
        if (connectedAddress) {
          const normalizedConnected = connectedAddress.toLowerCase();
          const alreadyIncluded = fetchedUsers.some(u => u.address.toLowerCase() === normalizedConnected);
          if (!alreadyIncluded) {
            fetchedUsers = [...fetchedUsers, { address: normalizedConnected, username: null, profileImageUrl: null }];
          }
        }

        setUsers(fetchedUsers);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
        setError("Failed to load leaderboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [connectedAddress, refreshKey]);

  // Fetch on-chain profiles (always fresh, unlike database)
  const userAddresses = useMemo(() => users.map(u => u.address), [users]);
  const { profiles: onChainProfiles } = useSubmitterProfiles(userAddresses);

  // Build balance calls for all users
  const balanceCalls = useMemo(() => {
    if (!tokenInfo || users.length === 0) return [];
    return users.map(user => ({
      address: tokenInfo.address as Address,
      abi: tokenInfo.abi,
      functionName: "balanceOf" as const,
      args: [user.address as Address],
    }));
  }, [tokenInfo, users]);

  // Fetch all balances
  const { data: balancesData, isLoading: balancesLoading } = useReadContracts({
    contracts: balanceCalls,
  });

  // Build sorted leaderboard
  const leaderboard: LeaderboardEntry[] = useMemo(() => {
    if (!balancesData || users.length === 0) return [];

    const entries = users.map((user, i) => {
      const result = balancesData[i];
      const balance = result?.status === "success" ? (result.result as bigint) : 0n;
      // Prefer on-chain profile (always fresh) over database profile (may be stale)
      const onChain = onChainProfiles[user.address.toLowerCase()];
      return {
        rank: 0,
        address: user.address,
        username: onChain?.username ?? user.username,
        profileImageUrl: onChain?.profileImageUrl ?? user.profileImageUrl,
        balance,
      };
    });

    // Sort by balance descending
    entries.sort((a, b) => {
      if (b.balance > a.balance) return 1;
      if (b.balance < a.balance) return -1;
      return 0;
    });

    // Filter out zero balances and assign ranks
    const nonZeroEntries = entries.filter(e => e.balance > 0n);
    nonZeroEntries.forEach((entry, i) => {
      entry.rank = i + 1;
    });

    return nonZeroEntries;
  }, [balancesData, users, onChainProfiles]);

  // Format balance with 6 decimals
  const formatBalance = (balance: bigint) => {
    const num = Number(balance) / 1e6;
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  // Truncate address
  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  if (isLoading || balancesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-error">
        <p>{error}</p>
      </div>
    );
  }

  if (leaderboard.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/50">
        <p>No token holders yet</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table w-full">
        <thead>
          <tr className="text-base-content/60">
            <th className="w-16 text-center">Rank</th>
            <th>User</th>
            <th className="text-right">cREP Balance</th>
          </tr>
        </thead>
        <tbody>
          {leaderboard.map(entry => {
            const isCurrentUser = connectedAddress?.toLowerCase() === entry.address.toLowerCase();
            return (
              <tr
                key={entry.address}
                className={`${isCurrentUser ? "bg-primary/10 font-semibold" : ""} hover:bg-base-200/50`}
              >
                <td className="text-center">
                  {entry.rank <= 3 ? (
                    <span
                      className={`text-lg ${
                        entry.rank === 1 ? "text-yellow-500" : entry.rank === 2 ? "text-gray-400" : "text-amber-600"
                      }`}
                    >
                      {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : "🥉"}
                    </span>
                  ) : (
                    <span className="text-base-content/60">#{entry.rank}</span>
                  )}
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <img
                      src={entry.profileImageUrl || blo(entry.address as `0x${string}`)}
                      onError={e => {
                        e.currentTarget.src = blo(entry.address as `0x${string}`);
                      }}
                      width={32}
                      height={32}
                      className="w-8 h-8 rounded-full object-cover shrink-0"
                      alt=""
                    />
                    <div className="flex flex-col">
                      {entry.username ? (
                        <>
                          <span className="font-medium">{entry.username}</span>
                          <span className="text-base text-base-content/50">{truncateAddress(entry.address)}</span>
                        </>
                      ) : (
                        <span className="font-mono">{truncateAddress(entry.address)}</span>
                      )}
                      {isCurrentUser && <span className="text-base text-primary">(You)</span>}
                    </div>
                  </div>
                </td>
                <td className="text-right font-mono">{formatBalance(entry.balance)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
