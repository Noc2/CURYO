"use client";

import Link from "next/link";
import { ArrowTopRightOnSquareIcon, ClockIcon, ScaleIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";

export const GovernanceStats = () => {
  // These are the hardcoded values from CuryoGovernor.sol
  // In production, these would be read from the contract
  const stats = {
    votingDelay: "7,200 blocks (~1 day)",
    votingPeriod: "50,400 blocks (~1 week)",
    proposalThreshold: "100 cREP",
    quorum: "4% of circulating supply",
    timelockDelay: "2 days",
  };

  return (
    <div className="surface-card rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4">Governance Parameters</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <ClockIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Voting Delay</p>
              <InfoTooltip text="Time before voting starts after proposal creation" />
            </div>
            <p className="text-base text-base-content/60">{stats.votingDelay}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <ClockIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Voting Period</p>
              <InfoTooltip text="Duration of the voting window" />
            </div>
            <p className="text-base text-base-content/60">{stats.votingPeriod}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <ScaleIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Proposal Threshold</p>
              <InfoTooltip text="cREP needed to create proposals" />
            </div>
            <p className="text-base text-base-content/60">{stats.proposalThreshold}</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl">
          <UserGroupIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Quorum Required</p>
              <InfoTooltip text="Minimum participation for valid vote" />
            </div>
            <p className="text-base text-base-content/60">{stats.quorum} (min 10K cREP)</p>
          </div>
        </div>

        <div className="flex items-start gap-3 p-3 bg-base-200 rounded-xl sm:col-span-2">
          <ClockIcon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="flex items-center gap-1">
              <p className="text-base font-medium">Timelock Delay</p>
              <InfoTooltip text="Waiting period before execution" />
            </div>
            <p className="text-base text-base-content/60">{stats.timelockDelay} before execution</p>
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
