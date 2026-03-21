"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useClaimAll } from "~~/hooks/useClaimAll";
import { useManualRevealVotes } from "~~/hooks/useManualRevealVotes";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";
import { getWalletDisplayLiquidMicro, useWalletDisplaySummary } from "~~/hooks/useWalletDisplaySummary";

function formatCrepAmount(value: bigint | null | undefined) {
  if (value == null) return "—";
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function useWalletSummaryData(address: Address, crepBalance: bigint | undefined) {
  const isPageVisible = usePageVisibility();
  const { data: syncedCrepBalance } = useQuery({
    queryKey: ["wallet-crep-balance", address.toLowerCase()],
    queryFn: async () => {
      const response = await fetch(`/api/leaderboard?includeAddress=${address}&limit=1`);
      const body = (await response.json().catch(() => null)) as {
        entries?: { address?: string; balance?: string }[];
        error?: string;
      } | null;
      const matchedEntry = body?.entries?.find(entry => entry.address?.toLowerCase() === address.toLowerCase());
      if (!response.ok || typeof matchedEntry?.balance !== "string") {
        throw new Error(body?.error || `Failed to fetch cREP balance (${response.status})`);
      }
      return BigInt(matchedEntry.balance);
    },
    enabled: Boolean(address),
    initialData: crepBalance,
    staleTime: 15_000,
    refetchInterval: isPageVisible ? 30_000 : false,
    retry: 1,
  });
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { activeStaked: votingStaked } = useVotingStakes(address);
  const { votes: activeVotes, earliestReveal, hasPendingReveals } = useActiveVotesWithDeadlines(address);
  const { readyCount: manualRevealReadyCount } = useManualRevealVotes(address);
  const showManualRevealLink = manualRevealReadyCount > 0;
  const liquidBalance = syncedCrepBalance ?? crepBalance;

  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
    watch: false,
    query: {
      staleTime: 60_000,
      refetchInterval: isPageVisible ? 60_000 : false,
    },
  });

  const fallbackVotingStaked = activeVotes.reduce((sum, vote) => sum + Number(vote.stake) / 1e6, 0);
  const effectiveVotingStaked = Math.max(votingStaked, fallbackVotingStaked);
  const summary = useWalletDisplaySummary(
    address,
    liquidBalance === undefined
      ? null
      : {
          liquidMicro: liquidBalance,
          votingStakedMicro: BigInt(Math.round(effectiveVotingStaked * 1e6)),
          submissionStakedMicro: BigInt(Math.round(totalSubmissionStake * 1e6)),
          frontendStakedMicro: frontendInfo?.[1] ?? 0n,
        },
  );
  const displayLiquidBalance = getWalletDisplayLiquidMicro(summary, liquidBalance);

  return {
    summary,
    liquidBalance: displayLiquidBalance,
    activeVotes,
    earliestReveal,
    hasPendingReveals,
    showManualRevealLink,
  };
}

export function WalletDetailsPanel({ address, crepBalance }: { address: Address; crepBalance: bigint | undefined }) {
  const { claimableItems, totalClaimable, refetch: refetchClaimable } = useAllClaimableRewards();
  const { claimAll, isClaiming, progress } = useClaimAll();
  const { summary, liquidBalance, activeVotes, earliestReveal, hasPendingReveals, showManualRevealLink } =
    useWalletSummaryData(address, crepBalance);
  const shouldShowStaked = (summary?.totalStakedMicro ?? 0n) > 0n || activeVotes.length > 0;

  const claimableFormatted =
    totalClaimable > 0n ? (Number(totalClaimable) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";

  const handleClaimAll = () => {
    claimAll(claimableItems, () => refetchClaimable());
  };

  const stakeParts: string[] = [];
  const submissionStake = Number(summary?.submissionStakedMicro ?? 0n) / 1e6;
  const frontendStake = Number(summary?.frontendStakedMicro ?? 0n) / 1e6;
  const votingStake = Number(summary?.votingStakedMicro ?? 0n) / 1e6;

  if (submissionStake > 0) stakeParts.push(`${submissionStake} cREP submissions`);
  if (votingStake > 0) {
    let votingLabel = `${votingStake} cREP voting`;
    if (earliestReveal) votingLabel += ` · reveals in ${earliestReveal}`;
    else if (showManualRevealLink || hasPendingReveals) votingLabel += ` · pending reveal`;
    stakeParts.push(votingLabel);
  }
  if (frontendStake > 0) stakeParts.push(`${frontendStake} cREP frontend`);
  const detailsText = stakeParts.join(" · ");

  return (
    <div className="space-y-1 px-4 pl-12 text-left">
      <div className="text-base text-base-content">{formatCrepAmount(liquidBalance)} cREP</div>
      {showManualRevealLink ? (
        <Link
          href="/vote/reveal"
          className="block text-xs text-base-content/50 underline underline-offset-2 hover:text-base-content"
        >
          Reveal my vote
        </Link>
      ) : null}
      {shouldShowStaked ? <div className="text-xs text-base-content/60">{detailsText || "Staked"}</div> : null}
      {totalClaimable > 0n ? (
        <div className="pt-1">
          <button onClick={handleClaimAll} disabled={isClaiming} className="btn btn-primary btn-xs">
            {isClaiming ? `Claiming ${progress.current}/${progress.total}...` : `Claim ${claimableFormatted}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
