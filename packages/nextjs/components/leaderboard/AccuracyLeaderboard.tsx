"use client";

import { useEffect, useState } from "react";
import { blo } from "blo";
import { useAccount } from "wagmi";
import { useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import { PonderAccuracyLeaderboardItem, ponderApi } from "~~/services/ponder/client";

type SortOption = "winRate" | "wins" | "stakeWon";
type MinVotesOption = "3" | "5" | "10";

export function AccuracyLeaderboard() {
  const { address: connectedAddress } = useAccount();
  const { categories } = useCategoryRegistry();

  const [items, setItems] = useState<PonderAccuracyLeaderboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("winRate");
  const [minVotes, setMinVotes] = useState<MinVotesOption>("3");
  const [categoryId, setCategoryId] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      setFetchError(false);
      try {
        const params: Record<string, string> = {
          sortBy,
          minVotes,
          limit: "50",
        };
        if (categoryId) params.categoryId = categoryId;
        const data = await ponderApi.getAccuracyLeaderboard(params);
        if (!cancelled) setItems(data.items);
      } catch (err) {
        console.error("Failed to fetch accuracy leaderboard:", err);
        if (!cancelled) {
          setItems([]);
          setFetchError(true);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [sortBy, minVotes, categoryId]);

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  const formatStake = (s: string) => {
    const num = Number(s) / 1e6;
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const approvedCategories = categories.filter(c => c.status === 1);

  return (
    <div className="surface-card rounded-2xl p-6 space-y-3">
      <span className="text-base font-medium text-base-content/60">Accuracy leaderboard</span>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Category filter */}
        <select
          className="select select-sm bg-base-200 text-base rounded-full"
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {approvedCategories.map(cat => (
            <option key={String(cat.id)} value={String(cat.id)}>
              {cat.name}
            </option>
          ))}
        </select>

        {/* Sort toggle */}
        <select
          className="select select-sm bg-base-200 text-base rounded-full"
          value={sortBy}
          aria-label="Sort by"
          onChange={e => setSortBy(e.target.value as SortOption)}
        >
          <option value="winRate">Win Rate</option>
          <option value="wins">Wins</option>
          <option value="stakeWon">Stake Won</option>
        </select>

        {/* Min votes filter */}
        <select
          className="select select-sm bg-base-200 text-base rounded-full"
          aria-label="Minimum votes"
          value={minVotes}
          onChange={e => setMinVotes(e.target.value as MinVotesOption)}
        >
          <option value="3">Min 3 votes</option>
          <option value="5">Min 5 votes</option>
          <option value="10">Min 10 votes</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      ) : fetchError ? (
        <div className="text-center py-12 text-base-content/50">
          <p>Failed to load leaderboard</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-base-content/50">
          <p>No voters with enough resolved votes yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr className="text-base-content/60">
                <th className="w-16 text-center">Rank</th>
                <th>User</th>
                <th className="text-right">Win Rate</th>
                <th className="text-right">W / L</th>
                {!categoryId && <th className="text-right">Streak</th>}
                <th className="text-right">Stake Won</th>
              </tr>
            </thead>
            <tbody>
              {items.map((entry, i) => {
                const rank = i + 1;
                const isCurrentUser = connectedAddress?.toLowerCase() === entry.voter.toLowerCase();
                const streak = entry.currentStreak;
                const streakLabel =
                  streak !== undefined ? (streak > 0 ? `${streak}W` : streak < 0 ? `${Math.abs(streak)}L` : "0") : "-";

                return (
                  <tr
                    key={entry.voter}
                    className={`${isCurrentUser ? "bg-primary/10 font-semibold" : ""} hover:bg-base-200/50`}
                  >
                    <td className="text-center">
                      {rank <= 3 ? (
                        <span className="text-lg">
                          {rank === 1 ? "\u{1F947}" : rank === 2 ? "\u{1F948}" : "\u{1F949}"}
                        </span>
                      ) : (
                        <span className="text-base-content/60">#{rank}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <img
                          src={entry.profileImageUrl || blo(entry.voter as `0x${string}`)}
                          onError={e => {
                            e.currentTarget.src = blo(entry.voter as `0x${string}`);
                          }}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                          alt={`${entry.profileName || truncateAddress(entry.voter)} avatar`}
                          loading="lazy"
                        />
                        <div className="flex flex-col">
                          {entry.profileName ? (
                            <>
                              <span className="font-medium">{entry.profileName}</span>
                              <span className="text-base text-base-content/50">{truncateAddress(entry.voter)}</span>
                            </>
                          ) : (
                            <span className="font-mono">{truncateAddress(entry.voter)}</span>
                          )}
                          {isCurrentUser && <span className="text-base text-primary">(You)</span>}
                        </div>
                      </div>
                    </td>
                    <td className="text-right font-mono">{formatRate(entry.winRate)}</td>
                    <td className="text-right font-mono">
                      {entry.totalWins} / {entry.totalLosses}
                    </td>
                    {!categoryId && <td className="text-right font-mono">{streakLabel}</td>}
                    <td className="text-right font-mono">{formatStake(entry.totalStakeWon)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
