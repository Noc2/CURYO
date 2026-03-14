"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { FollowScopeToggle } from "~~/components/leaderboard/FollowScopeToggle";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { getProxiedProfileImageUrl, getReputationAvatarUrl } from "~~/utils/profileImage";
import { notification } from "~~/utils/scaffold-eth";

interface LeaderboardEntry {
  rank: number;
  address: string;
  username: string | null;
  profileImageUrl: string | null;
  balance: string;
}

interface LeaderboardTableProps {
  /** Change this value to trigger a re-fetch of leaderboard data */
  refreshKey?: number;
}

export function LeaderboardTable({ refreshKey }: LeaderboardTableProps) {
  const { address: connectedAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const {
    followedWallets,
    toggleFollow,
    requestReadAccess,
    isPending: isFollowPending,
  } = useFollowedProfiles(connectedAddress, {
    autoRead: false,
  });

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "following">("all");

  // Fetch pre-ranked rows from the server.
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        setIsLoading(true);
        const params = new URLSearchParams();
        if (connectedAddress) {
          params.set("includeAddress", connectedAddress);
        }
        const res = await fetch(`/api/leaderboard${params.size > 0 ? `?${params.toString()}` : ""}`);
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error || `Leaderboard API returned ${res.status}`);
        }
        const data = body;
        setEntries(data.entries || []);
        setError(null);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, [connectedAddress, refreshKey]);

  const visibleEntries = useMemo(() => {
    if (scope === "all") return entries;
    return entries.filter(entry => followedWallets.has(entry.address.toLowerCase()));
  }, [entries, followedWallets, scope]);

  // Format balance with 6 decimals
  const formatBalance = (balance: string) => {
    const num = Number(balance) / 1e6;
    return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  // Truncate address
  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleToggleFollow = useCallback(
    async (targetAddress: string) => {
      const result = await toggleFollow(targetAddress);

      if (!result.ok) {
        if (result.reason === "not_connected") {
          notification.info("Connect your wallet to follow curators.");
          openConnectModal?.();
          return;
        }

        if (result.reason === "self_follow" || result.reason === "rejected") {
          return;
        }

        notification.error(result.error || "Failed to update follows");
        return;
      }

      notification.success(result.following ? "Following curator" : "Unfollowed curator");
    },
    [openConnectModal, toggleFollow],
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
          notification.info("Connect your wallet to filter by curators you follow.");
          openConnectModal?.();
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

  if (isLoading) {
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

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-base-content/50">
        <p>No token holders yet</p>
      </div>
    );
  }

  return (
    <div className="surface-card rounded-2xl p-6 overflow-x-auto">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className={surfaceSectionHeadingClassName}>cREP leaderboard</h2>
        <FollowScopeToggle value={scope} onChange={value => void handleScopeChange(value)} />
      </div>

      {scope === "following" && visibleEntries.length === 0 ? (
        <div className="py-12 text-center text-base-content/50">
          <p>You aren&apos;t following any token holders yet.</p>
        </div>
      ) : (
        <table className="table w-full">
          <thead>
            <tr className="text-base-content/60">
              <th className="w-16 text-center">Rank</th>
              <th>User</th>
              <th className="text-right">cREP Balance</th>
            </tr>
          </thead>
          <tbody>
            {visibleEntries.map(entry => {
              const isCurrentUser = connectedAddress?.toLowerCase() === entry.address.toLowerCase();
              const fallbackImageUrl = getReputationAvatarUrl(entry.address, 32) || "";
              const avatarSrc = getProxiedProfileImageUrl(entry.profileImageUrl) || fallbackImageUrl;
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
                    <div className="flex items-center justify-between gap-3">
                      <Link
                        href={`/profiles/${entry.address}`}
                        className="group flex min-w-0 items-center gap-3"
                        aria-label={`View profile for ${entry.username || truncateAddress(entry.address)}`}
                      >
                        <img
                          src={avatarSrc}
                          onError={e => {
                            e.currentTarget.src = fallbackImageUrl;
                          }}
                          width={32}
                          height={32}
                          className="w-8 h-8 rounded-full object-cover shrink-0"
                          alt={`${entry.username || truncateAddress(entry.address)} avatar`}
                          loading="lazy"
                        />
                        <div className="flex min-w-0 flex-col">
                          {entry.username ? (
                            <>
                              <span className="truncate font-medium transition-colors group-hover:text-primary">
                                {entry.username}
                              </span>
                              <span className="text-base text-base-content/50">{truncateAddress(entry.address)}</span>
                            </>
                          ) : (
                            <span className="font-mono transition-colors group-hover:text-primary">
                              {truncateAddress(entry.address)}
                            </span>
                          )}
                          {isCurrentUser && <span className="text-base text-primary">(You)</span>}
                        </div>
                      </Link>
                      {!isCurrentUser ? (
                        <FollowProfileButton
                          following={followedWallets.has(entry.address.toLowerCase())}
                          pending={isFollowPending(entry.address)}
                          onClick={() => {
                            void handleToggleFollow(entry.address);
                          }}
                          variant="pill"
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="text-right font-mono">{formatBalance(entry.balance)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
