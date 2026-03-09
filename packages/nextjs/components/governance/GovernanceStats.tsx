"use client";

import Link from "next/link";
import { ArrowTopRightOnSquareIcon, ClockIcon, ScaleIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useGovernanceStats } from "~~/hooks/useGovernance";

function formatCRep(amount: bigint | undefined) {
  if (amount === undefined) return "—";
  return `${(Number(amount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} cREP`;
}

function formatBlocks(blocks: bigint | undefined) {
  if (blocks === undefined) return "—";
  return `${blocks.toLocaleString()} blocks`;
}

function formatDelay(seconds: bigint | undefined) {
  if (seconds === undefined) return "—";
  const totalSeconds = Number(seconds);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);

  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.floor(totalSeconds / 60)} min`;
}

export const GovernanceStats = () => {
  const {
    hasGovernorContract,
    governorAddress,
    votingDelay,
    votingPeriod,
    proposalThreshold,
    quorumNumerator,
    minimumQuorum,
    currentQuorum,
    timelockDelay,
  } = useGovernanceStats();

  if (!hasGovernorContract) {
    return (
      <div className="surface-card rounded-2xl p-6 space-y-3">
        <h2 className="text-lg font-semibold">Governance Parameters</h2>
        <p className="text-base text-base-content/70">
          Live governor reads are not available on this network. This usually means you&apos;re on local dev, where
          governance roles are wired directly to the deployer instead of a deployed <code>CuryoGovernor</code>.
        </p>
        {governorAddress && (
          <p className="text-base text-base-content/50">
            Token governor address: <span className="font-mono">{governorAddress}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="surface-card rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4">Governance Parameters</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <ClockIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Voting Delay</p>
              <InfoTooltip text="Blocks between proposal creation and the start of voting." />
            </div>
            <p className="text-base text-base-content/60">{formatBlocks(votingDelay)}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <ClockIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Voting Period</p>
              <InfoTooltip text="Blocks during which votes can be cast." />
            </div>
            <p className="text-base text-base-content/60">{formatBlocks(votingPeriod)}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <ScaleIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Proposal Threshold</p>
              <InfoTooltip text="Voting power required to create a proposal." />
            </div>
            <p className="text-base text-base-content/60">{formatCRep(proposalThreshold)}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <UserGroupIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Current Quorum</p>
              <InfoTooltip text="Live quorum at the current block using the governor's dynamic circulating-supply calculation." />
            </div>
            <p className="text-base text-base-content/60">{formatCRep(currentQuorum)}</p>
            <p className="text-base text-base-content/40">
              {quorumNumerator ? `${quorumNumerator.toString()}% of circulating supply` : "—"} with floor{" "}
              {formatCRep(minimumQuorum)}
            </p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl sm:col-span-2">
          <ClockIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Timelock Delay</p>
              <InfoTooltip text="Minimum delay between a queued proposal and execution." />
            </div>
            <p className="text-base text-base-content/60">{formatDelay(timelockDelay)}</p>
          </div>
        </div>
      </div>

      <Link
        href="/docs/governance"
        className="flex items-center justify-center gap-2 text-base text-primary hover:text-primary-focus mt-4"
      >
        Learn more about governance
        <ArrowTopRightOnSquareIcon className="w-3 h-3" />
      </Link>
    </div>
  );
};
