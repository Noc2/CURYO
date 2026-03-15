"use client";

import { useCallback, useMemo } from "react";
import Link from "next/link";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { CategoryBars } from "~~/components/leaderboard/CategoryBars";
import { WinRateRing } from "~~/components/leaderboard/WinRateRing";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { ProfileImageLightbox } from "~~/components/shared/ProfileImageLightbox";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { type PonderProfileDetailResponse, type PonderVoteItem, ponderApi } from "~~/services/ponder/client";
import { getProxiedProfileImageUrl, getReputationAvatarUrl } from "~~/utils/profileImage";
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

function getUrlHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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
    <div className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.14)]">
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
  const {
    followedWallets,
    toggleFollow,
    isPending: isFollowPending,
  } = useFollowedProfiles(connectedAddress, {
    autoRead: false,
  });
  const { stats, categories } = useVoterAccuracy(normalizedAddress);
  const { hasVoterId, tokenId, isLoading: voterIdLoading } = useVoterIdNFT(normalizedAddress);
  const { data: balance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [normalizedAddress],
  });

  const { data: profileResult, isLoading: profileLoading } = usePonderQuery<
    PonderProfileDetailResponse,
    PonderProfileDetailResponse
  >({
    queryKey: ["publicProfile", normalizedAddress],
    ponderFn: async () => ponderApi.getProfile(normalizedAddress),
    rpcFn: async () => ({
      profile: null,
      summary: {
        totalVotes: 0,
        totalContent: 0,
        totalRewardsClaimed: "0",
      },
      recentVotes: [],
      recentRewards: [],
      recentSubmissions: [],
    }),
    enabled: true,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
  });

  const profileDetail = profileResult?.data ?? null;
  const summary = profileDetail?.profile ?? null;
  const recentVotes = profileDetail?.recentVotes ?? [];
  const recentSubmissions = profileDetail?.recentSubmissions ?? [];
  const ownProfile = connectedAddress?.toLowerCase() === normalizedAddress;
  const following = followedWallets.has(normalizedAddress);
  const pending = isFollowPending(normalizedAddress);
  const backHref = ownProfile ? "/settings" : "/governance";
  const fallbackImageUrl = getReputationAvatarUrl(normalizedAddress, 96) || "";

  const displayName = summary?.name || truncateAddress(normalizedAddress);
  const profileImageUrl = getProxiedProfileImageUrl(summary?.imageUrl) || fallbackImageUrl;
  const totalVotes = profileDetail?.summary.totalVotes ?? 0;
  const totalContent = profileDetail?.summary.totalContent ?? 0;
  const totalRewardsClaimed = profileDetail?.summary.totalRewardsClaimed ?? "0";
  const strategy = summary?.strategy?.trim() ?? "";

  const streakLabel = useMemo(() => {
    if (!stats) return "0";
    if (stats.currentStreak > 0) return `${stats.currentStreak}W`;
    if (stats.currentStreak < 0) return `${Math.abs(stats.currentStreak)}L`;
    return "0";
  }, [stats]);
  const strongestCategories = useMemo(
    () =>
      [...categories]
        .filter(category => category.categoryName)
        .sort((a, b) => b.totalSettledVotes - a.totalSettledVotes)
        .slice(0, 2)
        .map(category => category.categoryName as string),
    [categories],
  );
  const curatorHeadline = useMemo(() => {
    if (strongestCategories.length >= 2) {
      return `Best signal in ${strongestCategories[0]} and ${strongestCategories[1]}`;
    }
    if (strongestCategories.length === 1) {
      return `Best signal in ${strongestCategories[0]}`;
    }
    if (totalContent > 0) {
      return `${totalContent} submissions with a live public track record`;
    }
    if (stats && stats.totalSettledVotes > 0) {
      return `${stats.totalSettledVotes} settled votes building a track record`;
    }
    return "Still building a public curator track record";
  }, [stats, strongestCategories, totalContent]);
  const followExplanation = ownProfile
    ? "This is the public view other curators use to decide whether to trust your submissions and follow your activity."
    : following
      ? "Following turns this curator into a signal source for you: their new submissions show up in Curators You Follow, and you can enable submission and resolution alerts in Settings."
      : "Follow to surface this curator's new submissions in Curators You Follow and optionally get alerts when they submit or resolve rounds.";

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

    notification.success(
      result.following
        ? "Following curator. Their new submissions will show up in Curators You Follow."
        : "Unfollowed curator",
    );
  }, [normalizedAddress, openConnectModal, toggleFollow]);

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-5xl space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base font-medium text-white transition-colors hover:bg-white/[0.08]"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back
        </Link>

        <div className="surface-card rounded-3xl p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <ProfileImageLightbox
                src={profileImageUrl}
                fallbackSrc={fallbackImageUrl}
                alt={`${displayName} avatar`}
                width={96}
                height={96}
                triggerLabel="Open profile image"
                modalLabel={`${displayName} profile image`}
                buttonClassName="shrink-0 rounded-3xl"
                imageClassName="h-24 w-24 rounded-3xl object-cover shrink-0"
                modalImageClassName="rounded-[2rem]"
              />
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-semibold">{displayName}</h1>
                <div className="mt-2 font-mono text-base text-base-content/55 break-all">{normalizedAddress}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base text-base-content/60">
                    {profileLoading ? "..." : `${totalVotes} votes`}
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base text-base-content/60">
                    {totalContent} submissions
                  </div>
                  <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base text-base-content/60">
                    {voterIdLoading
                      ? "Loading Voter ID..."
                      : hasVoterId
                        ? `Voter ID #${tokenId.toString()}`
                        : "No Voter ID"}
                  </div>
                </div>
              </div>
            </div>

            {ownProfile ? (
              <Link
                href="/settings"
                className="inline-flex items-center justify-center rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-base font-medium text-white transition-colors hover:bg-white/[0.08]"
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

          {strategy ? (
            <div className="mt-6 rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] px-5 py-4">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
                {ownProfile ? "How you rate" : "How they rate"}
              </div>
              <p className="mt-2 max-w-3xl whitespace-pre-wrap text-base leading-7 text-base-content/75">{strategy}</p>
            </div>
          ) : ownProfile ? (
            <div className="mt-6 rounded-2xl border border-dashed border-white/14 px-5 py-4">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">How you rate</div>
              <p className="mt-2 max-w-3xl text-base leading-7 text-base-content/60">
                Add a short note about the signals you trust and what makes you vote up or down.
              </p>
              <Link
                href="/settings"
                className="mt-4 inline-flex items-center justify-center rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                Add your rating strategy
              </Link>
            </div>
          ) : null}
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
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/80">Curator snapshot</div>
              <h2 className="mt-2 text-2xl font-semibold">{curatorHeadline}</h2>
              <p className="mt-3 text-base leading-7 text-base-content/60">{followExplanation}</p>
            </div>

            {!ownProfile && following ? (
              <Link
                href="/settings"
                className="inline-flex items-center justify-center rounded-full border border-white/8 bg-white/[0.04] px-4 py-2 text-base font-medium text-white transition-colors hover:bg-white/[0.08]"
              >
                Manage alerts
              </Link>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {strongestCategories.map(categoryName => (
              <div
                key={categoryName}
                className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base text-base-content/70"
              >
                {categoryName}
              </div>
            ))}
            <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base">
              <span className="text-base-content/50">Win rate </span>
              <span className="font-mono tabular-nums">{stats ? `${(stats.winRate * 100).toFixed(1)}%` : "—"}</span>
            </div>
            <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base">
              <span className="text-base-content/50">Settled votes </span>
              <span className="font-mono tabular-nums">{stats ? stats.totalSettledVotes : 0}</span>
            </div>
            <div className="rounded-full border border-white/8 bg-white/[0.04] px-3 py-1.5 text-base">
              <span className="text-base-content/50">Submissions </span>
              <span className="font-mono tabular-nums">{totalContent}</span>
            </div>
          </div>
        </div>

        <div className="surface-card rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium text-base-content/60">Recent submissions</span>
              <InfoTooltip text="Latest content this curator has submitted. This is the clearest payoff from following them." />
            </div>
            <span className="text-base tabular-nums text-base-content/45">
              {profileLoading ? "..." : recentSubmissions.length}
            </span>
          </div>

          {profileLoading && recentSubmissions.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <span className="loading loading-spinner loading-sm"></span>
            </div>
          ) : recentSubmissions.length === 0 ? (
            <div className="rounded-2xl bg-base-content/[0.04] px-4 py-8 text-center text-base text-base-content/55">
              No submissions yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {recentSubmissions.map(submission => {
                const categoryName = submission.categoryName || `Category #${submission.categoryId}`;
                return (
                  <Link
                    key={submission.id}
                    href={`/vote?content=${submission.id}`}
                    className="rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4 transition-colors hover:bg-base-content/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold uppercase tracking-wide text-primary/80">
                          {categoryName}
                        </div>
                        <div className="mt-1 line-clamp-2 text-lg font-semibold leading-7">{submission.title}</div>
                        <p className="mt-1 line-clamp-2 text-sm text-base-content/65">{submission.description}</p>
                      </div>
                      <div className="rounded-full bg-base-content/[0.06] px-2.5 py-1 text-sm font-mono text-base-content/70">
                        {submission.rating}/100
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-base-content/55">
                      <span>{getUrlHost(submission.url)}</span>
                      <span>&bull;</span>
                      <span>{submission.totalVotes} votes</span>
                      <span>&bull;</span>
                      <span>{formatTimestamp(submission.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
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
              {profileLoading ? "..." : recentVotes.length}
            </span>
          </div>

          {profileLoading && recentVotes.length === 0 ? (
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
