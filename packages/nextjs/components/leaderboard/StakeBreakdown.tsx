"use client";

import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useClaimAll } from "~~/hooks/useClaimAll";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";

/**
 * Shows a breakdown of the connected user's actively staked cREP.
 * Uses the same hooks as the navbar for consistent data.
 */
export function StakeBreakdown() {
  const { address } = useAccount();
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { activeStaked } = useVotingStakes(address);
  const { earliestDeadline } = useActiveVotesWithDeadlines(address);

  // Claimable rewards
  const { claimableItems, totalClaimable, refetch: refetchClaimable } = useAllClaimableRewards();
  const { claimAll, isClaiming, progress } = useClaimAll();
  const claimableFormatted =
    totalClaimable > 0n ? (Number(totalClaimable) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "";
  const handleClaimAll = () => {
    claimAll(claimableItems, () => refetchClaimable());
  };

  // Frontend operator stake
  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
  });
  const frontendStake = frontendInfo ? Number(frontendInfo[1]) / 1e6 : 0;

  if (!address) return null;

  // Build stake entries (same logic as navbar)
  const entries: { label: string; amount: number; deadline?: string | null }[] = [];
  if (totalSubmissionStake > 0) entries.push({ label: "Submissions", amount: totalSubmissionStake });
  if (activeStaked > 0) entries.push({ label: "Voting", amount: activeStaked, deadline: earliestDeadline });
  if (frontendStake > 0) entries.push({ label: "Frontend", amount: frontendStake });

  if (entries.length === 0) return null;

  const totalStaked = entries.reduce((sum, e) => sum + e.amount, 0);

  const format = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="surface-card rounded-2xl p-6 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-base-content/60">Your staked cREP</span>
        <span className="text-base tabular-nums text-base-content/60">{format(totalStaked)} cREP</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(e =>
          e.deadline ? (
            <div
              key={e.label}
              className="tooltip tooltip-top flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm cursor-help"
              data-tip="Votes are revealed after each blind phase (~20 min). Rounds settle once the revealed-vote threshold is met and past-epoch reveal checks clear. If the threshold is not reached within 7 days, stakes are refunded."
            >
              <span className="text-base-content/50">{e.label}</span>
              <span className="font-mono tabular-nums">{format(e.amount)}</span>
              <span className="text-base-content/40 font-mono tabular-nums">· next {e.deadline}</span>
            </div>
          ) : (
            <div
              key={e.label}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm"
            >
              <span className="text-base-content/50">{e.label}</span>
              <span className="font-mono tabular-nums">{format(e.amount)}</span>
            </div>
          ),
        )}
      </div>
      {totalClaimable > 0n && (
        <div className="pt-2 border-t border-base-content/10">
          <button onClick={handleClaimAll} disabled={isClaiming} className="btn btn-primary btn-sm text-white w-full">
            {isClaiming ? `Claiming ${progress.current}/${progress.total}...` : `Claim ${claimableFormatted} cREP`}
          </button>
        </div>
      )}
    </div>
  );
}
