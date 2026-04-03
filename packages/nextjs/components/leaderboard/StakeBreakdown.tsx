"use client";

import { useAccount } from "wagmi";
import { ClaimRewardsButton } from "~~/components/shared/ClaimRewardsButton";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useActiveVotesWithDeadlines } from "~~/hooks/useActiveVotesWithDeadlines";
import { useSubmissionStakes } from "~~/hooks/useSubmissionStakes";
import { useVotingStakes } from "~~/hooks/useVotingStakes";

/**
 * Shows a breakdown of the connected user's actively staked cREP.
 * Uses the same hooks as the navbar for consistent data.
 */
export function StakeBreakdown({
  address: addressProp,
  showEmpty = false,
}: {
  address?: `0x${string}`;
  showEmpty?: boolean;
}) {
  const { address: connectedAddress } = useAccount();
  const address = addressProp ?? connectedAddress;
  const { totalSubmissionStake } = useSubmissionStakes(address);
  const { activeStaked } = useVotingStakes(address);
  const { earliestDeadline } = useActiveVotesWithDeadlines(address);

  // Frontend operator stake
  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
    query: { enabled: !!address },
  });
  const frontendStake = frontendInfo ? Number(frontendInfo[1]) / 1e6 : 0;

  if (!address) return null;

  // Build stake entries (same logic as navbar)
  const entries: { label: string; amount: number; deadline?: string | null }[] = [];
  if (totalSubmissionStake > 0) entries.push({ label: "Submissions", amount: totalSubmissionStake });
  if (activeStaked > 0) entries.push({ label: "Voting", amount: activeStaked, deadline: earliestDeadline });
  if (frontendStake > 0) entries.push({ label: "Frontend", amount: frontendStake });

  if (entries.length === 0 && !showEmpty) return null;

  const totalStaked = entries.reduce((sum, e) => sum + e.amount, 0);

  const format = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div className="surface-card rounded-2xl p-6 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <h2 className={surfaceSectionHeadingClassName}>Staked cREP</h2>
        <span className="text-base tabular-nums text-base-content/60">{format(totalStaked)} cREP</span>
      </div>
      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {entries.map(e =>
            e.deadline ? (
              <div
                key={e.label}
                className="tooltip tooltip-top flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-base-content/[0.06] text-sm cursor-help"
                data-tip="Votes are revealed after each blind phase (~20 min). Rounds settle once the revealed-vote threshold is met and past-epoch reveal checks clear. Below commit quorum at expiry, stakes refund. After commit quorum, missing reveal quorum can end in RevealFailed, where only revealed votes refund."
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
      ) : (
        <div className="rounded-2xl bg-base-content/[0.04] px-4 py-8 text-center text-base text-base-content/45">
          No active stakes
        </div>
      )}
      <ClaimRewardsButton className="border-t border-base-content/10 pt-2" />
    </div>
  );
}
