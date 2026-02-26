"use client";

import { Proposal, ProposalState } from "./types";
import { CheckCircleIcon, ClockIcon, ExclamationCircleIcon, PlayIcon, XCircleIcon } from "@heroicons/react/24/outline";

type ProposalCardProps = {
  proposal: Proposal;
};

const stateConfig: Record<
  ProposalState,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  [ProposalState.Pending]: {
    label: "Pending",
    color: "text-warning",
    bgColor: "bg-warning/10",
    icon: ClockIcon,
  },
  [ProposalState.Active]: {
    label: "Active",
    color: "text-primary",
    bgColor: "bg-primary/10",
    icon: PlayIcon,
  },
  [ProposalState.Canceled]: {
    label: "Canceled",
    color: "text-base-content/50",
    bgColor: "bg-base-200",
    icon: XCircleIcon,
  },
  [ProposalState.Defeated]: {
    label: "Defeated",
    color: "text-error",
    bgColor: "bg-error/10",
    icon: XCircleIcon,
  },
  [ProposalState.Succeeded]: {
    label: "Succeeded",
    color: "text-success",
    bgColor: "bg-success/10",
    icon: CheckCircleIcon,
  },
  [ProposalState.Queued]: {
    label: "Queued",
    color: "text-info",
    bgColor: "bg-info/10",
    icon: ClockIcon,
  },
  [ProposalState.Expired]: {
    label: "Expired",
    color: "text-base-content/50",
    bgColor: "bg-base-200",
    icon: ExclamationCircleIcon,
  },
  [ProposalState.Executed]: {
    label: "Executed",
    color: "text-success",
    bgColor: "bg-success/10",
    icon: CheckCircleIcon,
  },
};

export const ProposalCard = ({ proposal }: ProposalCardProps) => {
  const config = stateConfig[proposal.state];
  const StateIcon = config.icon;

  // Format vote counts (assuming 6 decimals)
  const formatVotes = (votes: bigint) => {
    return (Number(votes) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const forPercent = totalVotes > 0n ? Number((proposal.forVotes * 100n) / totalVotes) : 0;
  const againstPercent = totalVotes > 0n ? Number((proposal.againstVotes * 100n) / totalVotes) : 0;

  // Extract title from description (first line or first 100 chars)
  const title = proposal.description.split("\n")[0].slice(0, 100);
  const hasMoreDescription = proposal.description.length > title.length;

  return (
    <div className="border border-base-300 rounded-xl p-4 hover:border-primary/30 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-base truncate">{title}</h3>
          {hasMoreDescription && (
            <p className="text-base text-base-content/50 mt-1 line-clamp-2">
              {proposal.description.slice(title.length).trim()}
            </p>
          )}
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-base font-medium ${config.bgColor}`}>
          <StateIcon className={`w-3.5 h-3.5 ${config.color}`} />
          <span className={config.color}>{config.label}</span>
        </div>
      </div>

      {/* Vote Counts */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base text-base-content/50">For:</span>
          <span className="text-base font-medium text-success">{formatVotes(proposal.forVotes)}</span>
          <span className="text-base text-base-content/40">({forPercent}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base text-base-content/50">Against:</span>
          <span className="text-base font-medium text-error">{formatVotes(proposal.againstVotes)}</span>
          <span className="text-base text-base-content/40">({againstPercent}%)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-base text-base-content/50">Abstain:</span>
          <span className="text-base font-medium">{formatVotes(proposal.abstainVotes)}</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-base-200 rounded-full overflow-hidden mb-3">
        <div className="h-full flex">
          <div className="bg-success" style={{ width: `${forPercent}%` }} />
          <div className="bg-error" style={{ width: `${againstPercent}%` }} />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-base text-base-content/50">
        <span>
          by {proposal.proposer.slice(0, 6)}...{proposal.proposer.slice(-4)}
        </span>
        <span>ID: {proposal.id.slice(0, 8)}...</span>
      </div>

      {/* Action Button based on state */}
      {proposal.state === ProposalState.Active && (
        <button className="btn btn-curyo btn-sm w-full mt-4">Cast Vote</button>
      )}
      {proposal.state === ProposalState.Succeeded && (
        <button className="btn btn-outline btn-sm w-full mt-4">Queue for Execution</button>
      )}
      {proposal.state === ProposalState.Queued && (
        <button className="btn btn-outline btn-sm w-full mt-4">Execute</button>
      )}
    </div>
  );
};
