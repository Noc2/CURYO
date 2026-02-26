"use client";

import { useState } from "react";
import { ProposalCard } from "./ProposalCard";
import { Proposal, ProposalState } from "./types";
import { DocumentTextIcon, PlusIcon } from "@heroicons/react/24/outline";

// Re-export types for backwards compatibility
export type { Proposal, ProposalState } from "./types";

type FilterState = "all" | "active" | "pending" | "closed";

export const ProposalList = () => {
  const [filter, setFilter] = useState<FilterState>("all");

  // In production, this would fetch from contract events
  // For now, we show an empty state since no proposals exist yet
  const proposals: Proposal[] = [];

  const filteredProposals = proposals.filter(p => {
    if (filter === "all") return true;
    if (filter === "active") return p.state === ProposalState.Active;
    if (filter === "pending") return p.state === ProposalState.Pending;
    if (filter === "closed")
      return [
        ProposalState.Canceled,
        ProposalState.Defeated,
        ProposalState.Succeeded,
        ProposalState.Queued,
        ProposalState.Expired,
        ProposalState.Executed,
      ].includes(p.state);
    return true;
  });

  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Proposals</h2>
        <button className="btn btn-curyo btn-sm gap-2" disabled title="Coming soon - requires 100 cREP">
          <PlusIcon className="w-4 h-4" />
          New Proposal
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-6">
        {(["all", "active", "pending", "closed"] as FilterState[]).map(f => (
          <button
            key={f}
            className={`px-3 py-1.5 rounded-lg text-base font-medium transition-colors capitalize ${
              filter === f ? "pill-active-yellow" : "bg-base-200 hover:bg-base-300"
            }`}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Proposals List */}
      {filteredProposals.length > 0 ? (
        <div className="space-y-4">
          {filteredProposals.map(proposal => (
            <ProposalCard key={proposal.id} proposal={proposal} />
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <DocumentTextIcon className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <p className="text-base-content/60 mb-2">No proposals yet</p>
          <p className="text-base text-base-content/40">
            {filter === "all"
              ? "Be the first to create a proposal! Requires 100 cREP voting power."
              : `No ${filter} proposals found.`}
          </p>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 p-4 bg-base-200 rounded-xl">
        <h3 className="text-base font-medium mb-2">How Governance Works</h3>
        <ol className="text-base text-base-content/60 space-y-1 list-decimal list-inside">
          <li>Hold cREP to have voting power (activated automatically)</li>
          <li>Create a proposal (requires 100 cREP)</li>
          <li>Community votes for 1 week</li>
          <li>If passed (4% circulating supply quorum), queue in timelock</li>
          <li>After 2-day delay, anyone can execute</li>
        </ol>
      </div>
    </div>
  );
};
