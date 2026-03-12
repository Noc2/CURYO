"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { blo } from "blo";
import { useAccount } from "wagmi";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { CategoryBars } from "~~/components/leaderboard/CategoryBars";
import { WinRateRing } from "~~/components/leaderboard/WinRateRing";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { useSubmitterProfiles } from "~~/hooks/useSubmitterProfiles";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";
import { type PonderProfile, type PonderVoteItem, ponderApi } from "~~/services/ponder/client";
import { getProxiedProfileImageUrl } from "~~/utils/profileImage";
import { notification } from "~~/utils/scaffold-eth";

interface PublicProfileViewProps {
  address: `0x${string}`;
}

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCrepString(value: string | null | undefined) {
  if (!value) return "0";
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatCrepBigInt(value: bigint | undefined) {
  if (value === undefined) return "0";
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatTimestamp(timestamp: string) {
  return new Date(Number(timestamp) * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getVoteDirection(vote: PonderVoteItem) {
  if (vote.isUp === true) return { label: "Up", className: "text-success" };
  if (vote.isUp === false) return { label: "Down", className: "text-error" };
  return { label: "Hidden", className: "text-base-content/50" };
}

function getVoteOutcome(vote: PonderVoteItem) {
  if (vote.roundState === ROUND_STATE.Settled && vote.revealed && vote.isUp !== null && vote.roundUpWins !== null) {
    return vote.isUp === vote.roundUpWins
      ? { label: "Won", className: "text-success" }
      : { label: "Lost", className: "text-error" };
  }

  if (vote.roundState === ROUND_STATE.Cancelled) return { label: "Cancelled", className: "text-base-content/50" };
  if (vote.roundState === ROUND_STATE.Tied) return { label: "Tied", className: "text-warning" };
  if (vote.roundState === ROUND_STATE.RevealFailed) return { label: "Reveal failed", className: "text-warning" };
  if (!vote.revealed) return { label: "Committed", className: "text-base-content/50" };
  return { label: "Open", className: "text-primary" };
}

function StatCard({ label, value, tooltip }: { label: string; value: string; tooltip?: string }) {
  return (
    <div className="rounded-2xl bg-base-content/[0.05] px-4 py-3">
      <div className="flex items-center gap-1.5 text-base text-base-content/45">
        <span>{label}</span>
        {tooltip ? <InfoTooltip text={tooltip} /> : null}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function PublicProfileView({ address }: PublicProfileViewProps) {
  const normalizedAddress = address.toLowerCase() as `0x${string}`;
  const isPageVisible = usePageVisibility();
  const { address: connectedAddress } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { profiles } = useSubmitterProfiles([normalizedAddress]);
  const {
    followedWallets,
    toggleFollow,
    isPending: isFollowPending,
  } = useFollowedProfiles(connectedAddress, {
    autoRead: true,
  });
  const { stats, categories } = useVoterAccuracy(normalizedAddress);
  const { data: balance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [normalizedAddress],
  });

  const { data: summaryResult, isLoading: summaryLoading } = usePonderQuery<PonderProfile | null, PonderProfile | null>(
    {
      queryKey: ["publicProfileSummary", normalizedAddress],
      ponderFn: async () => {
        const profileMap = await ponderApi.getProfiles([normalizedAddress]);
        return profileMap[normalizedAddress] ?? null;
      },
      rpcFn: async () => null,
      enabled: true,
      staleTime: 30_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  );

  const { data: votesResult, isLoading: votesLoading } = usePonderQuery<
    { items: PonderVoteItem[] },
    { items: PonderVoteItem[] }
  >({
    queryKey: ["publicProfileVotes", normalizedAddress],
    ponderFn: async () => ponderApi.getVotes({ voter: normalizedAddress, limit: "20" }),
    rpcFn: async () => ({ items: [] }),
    enabled: true,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 60_000 : false,
  });

  const summary = summaryResult?.data ?? null;
  const recentVotes = votesResult?.data.items ?? [];
  const ownProfile = connectedAddress?.toLowerCase() === normalizedAddress;
  const following = followedWallets.has(normalizedAddress);
  const pending = isFollowPending(normalizedAddress);
  const fallbackProfile = profiles[normalizedAddress];
  const backHref = ownProfile ? "/settings" : "/governance";
  const fallbackImageUrl = blo(normalizedAddress);

  const displayName = summary?.name || fallbackProfile?.username || truncateAddress(normalizedAddress);
  const profileImageUrl =
    getProxiedProfileImageUrl(summary?.imageUrl || fallbackProfile?.profileImageUrl) || fallbackImageUrl;
  const totalVotes = summary?.totalVotes ?? 0;
  const totalContent = summary?.totalContent ?? 0;
  const totalRewardsClaimed = summary?.totalRewardsClaimed ?? "0";

  const streakLabel = useMemo(() => {
    if (!stats) return "0";
    if (stats.currentStreak > 0) return `${stats.currentStreak}W`;
    if (stats.currentStreak < 0) return `${Math.abs(stats.currentStreak)}L`;
    return "0";
  }, [stats]);

  const handleToggleFollow = useCallback(async () => {
    const result = await toggleFollow(normalizedAddress);

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
  }, [normalizedAddress, openConnectModal, toggleFollow]);

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-5xl space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-full bg-base-200 px-3 py-1.5 text-base font-medium text-white transition-colors hover:bg-base-300"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </Link>

        <div className="surface-card rounded-3xl p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <img
                src={profileImageUrl}
                onError={event => {
                  event.currentTarget.src = fallbackImageUrl;
                }}
                width={96}
                height={96}
                className="h-24 w-24 rounded-3xl object-cover shrink-0"
                alt={`${displayName} avatar`}
              />
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-semibold">{displayName}</h1>
                <div className="mt-2 font-mono text-base text-base-content/55 break-all">{normalizedAddress}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base text-base-content/60">
                    {summaryLoading ? "..." : `${totalVotes} votes`}
                  </div>
                  <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base text-base-content/60">
                    {totalContent} submissions
                  </div>
                </div>
              </div>
            </div>

            {ownProfile ? (
              <Link
                href="/settings"
                className="inline-flex items-center justify-center rounded-full bg-base-200 px-4 py-2 text-base font-medium text-white transition-colors hover:bg-base-300"
              >
                Manage profile
              </Link>
            ) : (
              <FollowProfileButton
                following={following}
                pending={pending}
                onClick={() => {
                  void handleToggleFollow();
                }}
                variant="pill"
              />
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Current cREP"
            value={formatCrepBigInt(balance)}
            tooltip={ownProfile ? "Your current cREP balance." : "Current cREP balance."}
          />
          <StatCard
            label="Resolved votes"
            value={stats ? String(stats.totalSettledVotes) : "0"}
            tooltip="Settled rounds only."
          />
          <StatCard
            label="Claimed rewards"
            value={`${formatCrepString(totalRewardsClaimed)} cREP`}
            tooltip="Claimed voter rewards indexed by Ponder."
          />
          <StatCard
            label="Best streak"
            value={stats ? `${stats.bestWinStreak}W` : "0"}
            tooltip="Longest win streak. Current streak is shown below."
          />
        </div>

        <div className="surface-card rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium text-base-content/60">Voting performance</span>
              <InfoTooltip text="Resolved rounds only. Category bars show win and loss ratios by category." />
            </div>
            <span className="text-base tabular-nums text-base-content/60">{stats ? stats.totalSettledVotes : 0}</span>
          </div>

          {stats ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                <WinRateRing winRate={stats.winRate} wins={stats.totalWins} losses={stats.totalLosses} />

                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base">
                      <span className="text-base-content/50">Current streak </span>
                      <span className="font-mono tabular-nums">{streakLabel}</span>
                    </div>
                    <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base">
                      <span className="text-base-content/50">Best streak </span>
                      <span className="font-mono tabular-nums">{stats.bestWinStreak}W</span>
                    </div>
                    <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base">
                      <span className="text-base-content/50">Win rate </span>
                      <span className="font-mono tabular-nums">{(stats.winRate * 100).toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-base-content/[0.05] px-4 py-3">
                      <div className="text-base text-base-content/45">Stake won</div>
                      <div className="mt-1 text-xl font-semibold text-success">
                        {formatCrepString(stats.totalStakeWon)} cREP
                      </div>
                    </div>
                    <div className="rounded-2xl bg-base-content/[0.05] px-4 py-3">
                      <div className="text-base text-base-content/45">Stake lost</div>
                      <div className="mt-1 text-xl font-semibold text-error">
                        {formatCrepString(stats.totalStakeLost)} cREP
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <CategoryBars categories={categories} />
            </div>
          ) : (
            <div className="rounded-2xl bg-base-content/[0.04] px-4 py-8 text-center text-base text-base-content/55">
              No resolved voting history yet.
            </div>
          )}
        </div>

        <div className="surface-card rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium text-base-content/60">Recent votes</span>
              <InfoTooltip text="Latest 20 vote commits for this wallet. Outcomes appear once rounds settle." />
            </div>
            <span className="text-base tabular-nums text-base-content/45">
              {votesLoading ? "..." : recentVotes.length}
            </span>
          </div>

          {votesLoading && recentVotes.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <span className="loading loading-spinner loading-sm"></span>
            </div>
          ) : recentVotes.length === 0 ? (
            <div className="rounded-2xl bg-base-content/[0.04] px-4 py-8 text-center text-base text-base-content/55">
              No recent votes yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="text-base-content/60">
                    <th>Content</th>
                    <th>Vote</th>
                    <th>Status</th>
                    <th className="text-right">Stake</th>
                    <th className="text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVotes.map(vote => {
                    const direction = getVoteDirection(vote);
                    const outcome = getVoteOutcome(vote);

                    return (
                      <tr key={vote.id} className="hover:bg-base-200/40">
                        <td>
                          <Link
                            href={`/vote?content=${vote.contentId}`}
                            className="font-medium transition-colors hover:text-primary"
                          >
                            Content #{vote.contentId}
                          </Link>
                          <div className="text-base text-base-content/45">Round #{vote.roundId}</div>
                        </td>
                        <td>
                          <span className={`font-medium ${direction.className}`}>{direction.label}</span>
                        </td>
                        <td>
                          <span className={`font-medium ${outcome.className}`}>{outcome.label}</span>
                        </td>
                        <td className="text-right font-mono">{formatCrepString(vote.stake)} cREP</td>
                        <td className="text-right text-base-content/55">{formatTimestamp(vote.committedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
