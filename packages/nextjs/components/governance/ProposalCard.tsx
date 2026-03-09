"use client";

import { Proposal, ProposalState } from "./types";
import { CheckCircleIcon, ClockIcon, ExclamationCircleIcon, PlayIcon, XCircleIcon } from "@heroicons/react/24/outline";

type ProposalCardProps = {
  proposal: Proposal;
  isActing?: boolean;
  onVote: (proposalId: bigint, support: 0 | 1 | 2) => Promise<void>;
  onQueue: (proposal: Proposal) => Promise<void>;
  onExecute: (proposal: Proposal) => Promise<void>;
};

const stateConfig: Record<
  ProposalState,
  {
    label: string;
    color: string;
    bgColor: string;
    icon: typeof ClockIcon;
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

function formatVotes(votes: bigint) {
  return (Number(votes) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatTimestamp(timestamp: bigint) {
  if (timestamp === 0n) return "—";
  return new Date(Number(timestamp) * 1000).toLocaleString();
}

export const ProposalCard = ({ proposal, isActing = false, onVote, onQueue, onExecute }: ProposalCardProps) => {
  const config = stateConfig[proposal.state];
  const StateIcon = config.icon;
  const totalVotes = proposal.forVotes + proposal.againstVotes + proposal.abstainVotes;
  const forPercent = totalVotes > 0n ? Number((proposal.forVotes * 100n) / totalVotes) : 0;
  const againstPercent = totalVotes > 0n ? Number((proposal.againstVotes * 100n) / totalVotes) : 0;
  const title = proposal.description.split("\n")[0].trim() || `Proposal ${proposal.proposalId.toString()}`;
  const detail = proposal.description.slice(title.length).trim();
  const canQueue = proposal.state === ProposalState.Succeeded && proposal.needsQueuing;
  const canExecute =
    proposal.state === ProposalState.Queued || (proposal.state === ProposalState.Succeeded && !proposal.needsQueuing);

  return (
    <div className="border border-base-300 rounded-xl p-4 hover:border-primary/30 transition-colors space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium text-base">{title}</h3>
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-base font-medium ${config.bgColor}`}
            >
              <StateIcon className={`w-3.5 h-3.5 ${config.color}`} />
              <span className={config.color}>{config.label}</span>
            </div>
            {proposal.hasVoted && proposal.state === ProposalState.Active && (
              <span className="px-2 py-0.5 rounded-full text-base font-medium bg-success/10 text-success">
                Vote submitted
              </span>
            )}
          </div>

          {detail && <p className="text-base text-base-content/60 whitespace-pre-wrap">{detail}</p>}

          {proposal.actions.length > 0 && (
            <div className="space-y-1">
              {proposal.actions.map((action, index) => (
                <div key={`${proposal.id}-action-${index}`} className="text-base font-mono text-base-content/70">
                  {action.summary}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap text-base text-base-content/50">
        <span>Proposal #{proposal.proposalId.toString()}</span>
        <span>
          by {proposal.proposer.slice(0, 6)}...{proposal.proposer.slice(-4)}
        </span>
        <span>Snapshot block {proposal.startBlock.toString()}</span>
        <span>Deadline block {proposal.endBlock.toString()}</span>
        {proposal.eta > 0n && <span>ETA {formatTimestamp(proposal.eta)}</span>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-base-200 rounded-xl p-3">
          <p className="text-base text-base-content/50">For</p>
          <p className="font-semibold text-success">{formatVotes(proposal.forVotes)}</p>
        </div>
        <div className="bg-base-200 rounded-xl p-3">
          <p className="text-base text-base-content/50">Against</p>
          <p className="font-semibold text-error">{formatVotes(proposal.againstVotes)}</p>
        </div>
        <div className="bg-base-200 rounded-xl p-3">
          <p className="text-base text-base-content/50">Abstain</p>
          <p className="font-semibold">{formatVotes(proposal.abstainVotes)}</p>
        </div>
      </div>

      <div className="h-2 bg-base-200 rounded-full overflow-hidden">
        <div className="h-full flex">
          <div className="bg-success" style={{ width: `${forPercent}%` }} />
          <div className="bg-error" style={{ width: `${againstPercent}%` }} />
        </div>
      </div>

      {proposal.state === ProposalState.Active && !proposal.hasVoted && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button className="btn btn-sm btn-success" disabled={isActing} onClick={() => onVote(proposal.proposalId, 1)}>
            Vote For
          </button>
          <button className="btn btn-sm btn-error" disabled={isActing} onClick={() => onVote(proposal.proposalId, 0)}>
            Vote Against
          </button>
          <button className="btn btn-sm btn-outline" disabled={isActing} onClick={() => onVote(proposal.proposalId, 2)}>
            Abstain
          </button>
        </div>
      )}

      {canQueue && (
        <button className="btn btn-outline btn-sm w-full" disabled={isActing} onClick={() => onQueue(proposal)}>
          Queue Proposal
        </button>
      )}

      {canExecute && (
        <button className="btn btn-curyo btn-sm w-full" disabled={isActing} onClick={() => onExecute(proposal)}>
          Execute Proposal
        </button>
      )}
    </div>
  );
};
