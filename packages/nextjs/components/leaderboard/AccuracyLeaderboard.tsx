"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { FollowScopeToggle } from "~~/components/leaderboard/FollowScopeToggle";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { getCategoryDisplayName } from "~~/lib/categoryDisplay";
import { FOLLOWED_CURATOR_TOAST_ID } from "~~/lib/notifications/followedActivity";
import { PonderAccuracyLeaderboardItem, PonderAccuracyLeaderboardWindow, ponderApi } from "~~/services/ponder/client";
import { getReputationAvatarUrl } from "~~/utils/profileImage";
import { notification } from "~~/utils/scaffold-eth";

type SortOption = "winRate" | "wins" | "stakeWon" | "settledVotes";
type MinVotesOption = "1" | "3" | "5" | "10";
type WindowOption = PonderAccuracyLeaderboardWindow;

export function AccuracyLeaderboard() {
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { openConnectModal } = useCuryoConnectModal();
  const { categories } = useCategoryRegistry();
  const {
    followedWallets,
    toggleFollow,
    requestReadAccess,
    isPending: isFollowPending,
  } = useFollowedProfiles(connectedAddress, {
    autoRead: false,
  });

  const [items, setItems] = useState<PonderAccuracyLeaderboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("wins");
  const [minVotes, setMinVotes] = useState<MinVotesOption>("1");
  const [window, setWindow] = useState<WindowOption>("all");
  const [categoryId, setCategoryId] = useState<string>("");
  const [scope, setScope] = useState<"all" | "following">("all");

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setIsLoading(true);
      setFetchError(false);
      try {
        const params: Record<string, string> = {
          sortBy,
          window,
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
  }, [sortBy, window, minVotes, categoryId]);

  const truncateAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatRate = (rate: number) => `${(rate * 100).toFixed(1)}%`;
  const formatStake = (s: string) => {
    const num = Number(s) / 1e6;
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const approvedCategories = categories.filter(c => c.status === 1);
  const showStreakColumn = window === "all" && !categoryId;
  const visibleItems = useMemo(() => {
    return items.flatMap((entry, index) => {
      if (scope === "following" && !followedWallets.has(entry.voter.toLowerCase())) {
        return [];
      }
      return [{ entry, rank: index + 1 }];
    });
  }, [followedWallets, items, scope]);

  const handleToggleFollow = useCallback(
    async (targetAddress: string) => {
      const result = await toggleFollow(targetAddress);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Sign in to follow curators.", { id: FOLLOWED_CURATOR_TOAST_ID });
          void openConnectModal();
          return;
        }

        if (result.reason === "self_follow" || result.reason === "rejected") {
          return;
        }

        notification.error(result.error || "Failed to update follows", { id: FOLLOWED_CURATOR_TOAST_ID });
        return;
      }

      const curatorName =
        items.find(entry => entry.voter.toLowerCase() === targetAddress.toLowerCase())?.profileName || "curator";
      const followMessage = result.following ? `Following ${curatorName}` : `Unfollowed ${curatorName}`;
      notification.success(followMessage, {
        id: FOLLOWED_CURATOR_TOAST_ID,
      });
    },
    [items, openConnectModal, toggleFollow],
  );

  const handleScopeChange = useCallback(
    async (nextScope: "all" | "following") => {
      if (nextScope === "all") {
        setScope("all");
        return;
      }

      const result = await requestReadAccess();
      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Sign in to filter by curators you follow.");
          void openConnectModal();
          return;
        }

        if (result.reason !== "rejected") {
          notification.error(result.error || "Failed to unlock your follow list");
        }
        return;
      }

      setScope("following");
    },
    [openConnectModal, requestReadAccess],
  );

  return (
    <div className="surface-card rounded-2xl p-6 space-y-3">
      <h2 className={surfaceSectionHeadingClassName}>Leaderboard</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FollowScopeToggle value={scope} onChange={value => void handleScopeChange(value)} />

        <select
          className="select select-sm bg-base-200 text-base rounded-full"
          value={window}
          aria-label="Time range"
          onChange={e => setWindow(e.target.value as WindowOption)}
        >
          <option value="all">All time</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="365d">Last 365 days</option>
          <option value="season">Current season</option>
        </select>

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
              {getCategoryDisplayName(cat) ?? cat.name}
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
          <option value="settledVotes">Settled Votes</option>
        </select>

        {/* Min votes filter */}
        <select
          className="select select-sm bg-base-200 text-base rounded-full"
          aria-label="Minimum votes"
          value={minVotes}
          onChange={e => setMinVotes(e.target.value as MinVotesOption)}
        >
          <option value="1">Min 1 vote</option>
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
          <p>No voters with enough resolved votes in this range yet</p>
        </div>
      ) : scope === "following" && visibleItems.length === 0 ? (
        <div className="text-center py-12 text-base-content/50">
          <p>You aren&apos;t following any qualifying voters yet.</p>
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
                {showStreakColumn && <th className="text-right">Streak</th>}
                <th className="text-right">Stake Won</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map(({ entry, rank }) => {
                const isCurrentUser = connectedAddress?.toLowerCase() === entry.voter.toLowerCase();
                const streak = entry.currentStreak;
                const streakLabel =
                  streak !== undefined ? (streak > 0 ? `${streak}W` : streak < 0 ? `${Math.abs(streak)}L` : "0") : "-";
                const avatarSrc = getReputationAvatarUrl(entry.voter, 32, null, targetNetwork.id) || "";

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
                      <div className="flex items-center justify-between gap-3">
                        <Link
                          href={`/profiles/${entry.voter}`}
                          className="group flex min-w-0 items-center gap-3"
                          aria-label={`View profile for ${entry.profileName || truncateAddress(entry.voter)}`}
                        >
                          <img
                            src={avatarSrc}
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full object-cover shrink-0"
                            alt={`${entry.profileName || truncateAddress(entry.voter)} avatar`}
                            loading="lazy"
                          />
                          <div className="flex min-w-0 flex-col">
                            {entry.profileName ? (
                              <>
                                <span className="truncate font-medium transition-colors group-hover:text-primary">
                                  {entry.profileName}
                                </span>
                                <span className="text-base text-base-content/50">{truncateAddress(entry.voter)}</span>
                              </>
                            ) : (
                              <span className="font-mono transition-colors group-hover:text-primary">
                                {truncateAddress(entry.voter)}
                              </span>
                            )}
                            {isCurrentUser && <span className="text-base text-primary">(You)</span>}
                          </div>
                        </Link>
                        {!isCurrentUser ? (
                          <FollowProfileButton
                            following={followedWallets.has(entry.voter.toLowerCase())}
                            pending={isFollowPending(entry.voter)}
                            onClick={() => {
                              void handleToggleFollow(entry.voter);
                            }}
                            variant="pill"
                          />
                        ) : null}
                      </div>
                    </td>
                    <td className="text-right font-mono">{formatRate(entry.winRate)}</td>
                    <td className="text-right font-mono">
                      {entry.totalWins} / {entry.totalLosses}
                    </td>
                    {showStreakColumn && <td className="text-right font-mono">{streakLabel}</td>}
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
