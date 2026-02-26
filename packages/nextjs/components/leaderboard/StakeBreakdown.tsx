"use client";

import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";

/**
 * Shows a breakdown of the connected user's actively staked cREP.
 * Uses the same hooks as the navbar for consistent data.
 */
export function StakeBreakdown() {
  const { address } = useAccount();
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { currentStaked, revealingStaked } = useVotingStakes(address);

  // Frontend operator stake
  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
  });
  const frontendStake = frontendInfo ? Number(frontendInfo[1]) / 1e6 : 0;

  if (!address) return null;

  // Build stake entries (same logic as navbar)
  const entries: { label: string; amount: number }[] = [];
  if (totalSubmissionStake > 0) entries.push({ label: "Submissions", amount: totalSubmissionStake });
  if (currentStaked > 0) entries.push({ label: "Voting", amount: currentStaked });
  if (revealingStaked > 0) entries.push({ label: "In Rounds", amount: revealingStaked });
  if (frontendStake > 0) entries.push({ label: "Frontend", amount: frontendStake });

  if (entries.length === 0) return null;

  const totalStaked = entries.reduce((sum, e) => sum + e.amount, 0);

  const format = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-base font-medium text-base-content/60">Your staked cREP</span>
        <span className="text-base tabular-nums text-base-content/60">{format(totalStaked)} cREP</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(e => (
          <div
            key={e.label}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm"
          >
            <span className="text-base-content/50">{e.label}</span>
            <span className="font-mono tabular-nums">{format(e.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
