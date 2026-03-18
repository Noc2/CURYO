"use client";

import { useMemo, useState } from "react";
import { ProposalCard } from "./ProposalCard";
import { Proposal, ProposalState } from "./types";
import { useQueryClient } from "@tanstack/react-query";
import { DocumentTextIcon, PlusIcon } from "@heroicons/react/24/outline";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { governorAbi, useGovernanceContracts, useGovernanceWrite, useGovernorProposals } from "~~/hooks/useGovernance";

type FilterState = "all" | "active" | "pending" | "closed";

export const ProposalList = () => {
  const [filter, setFilter] = useState<FilterState>("all");
  const [actingProposalId, setActingProposalId] = useState<bigint | null>(null);
  const queryClient = useQueryClient();
  const { governorAddress, hasGovernorContract } = useGovernanceContracts();
  const { data: proposals = [], isLoading, error } = useGovernorProposals();
  const { writeContractAsync, isPending } = useGovernanceWrite();

  const filteredProposals = useMemo(() => {
    return proposals.filter(proposal => {
      if (filter === "all") return true;
      if (filter === "active") return proposal.state === ProposalState.Active;
      if (filter === "pending") return proposal.state === ProposalState.Pending;
      if (filter === "closed") {
        return [
          ProposalState.Canceled,
          ProposalState.Defeated,
          ProposalState.Succeeded,
          ProposalState.Queued,
          ProposalState.Expired,
          ProposalState.Executed,
        ].includes(proposal.state);
      }
      return true;
    });
  }, [filter, proposals]);

  const refreshProposals = async () => {
    await queryClient.invalidateQueries({ queryKey: ["governor-proposals"] });
  };

  const handleVote = async (proposalId: bigint, support: 0 | 1 | 2) => {
    if (!governorAddress) return;
    setActingProposalId(proposalId);
    try {
      await writeContractAsync({
        address: governorAddress,
        abi: governorAbi,
        functionName: "castVote",
        args: [proposalId, support],
      });
      await refreshProposals();
    } finally {
      setActingProposalId(null);
    }
  };

  const handleQueue = async (proposal: Proposal) => {
    if (!governorAddress) return;
    setActingProposalId(proposal.proposalId);
    try {
      await writeContractAsync({
        address: governorAddress,
        abi: governorAbi,
        functionName: "queue",
        args: [proposal.targets, proposal.values, proposal.calldatas, proposal.descriptionHash],
      });
      await refreshProposals();
    } finally {
      setActingProposalId(null);
    }
  };

  const handleExecute = async (proposal: Proposal) => {
    if (!governorAddress) return;
    setActingProposalId(proposal.proposalId);
    try {
      await writeContractAsync({
        address: governorAddress,
        abi: governorAbi,
        functionName: "execute",
        args: [proposal.targets, proposal.values, proposal.calldatas, proposal.descriptionHash],
      });
      await refreshProposals();
    } finally {
      setActingProposalId(null);
    }
  };

  const scrollToComposer = () => {
    document.getElementById("governance-action-composer")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div>
          <h2 className={surfaceSectionHeadingClassName}>Proposals</h2>
          <p className="text-base text-base-content/50">
            {hasGovernorContract
              ? `${proposals.length} on-chain proposal${proposals.length === 1 ? "" : "s"}`
              : "Governor unavailable on this network"}
          </p>
        </div>
        <button className="btn btn-primary btn-sm gap-2" onClick={scrollToComposer}>
          <PlusIcon className="w-4 h-4" />
          New Action
        </button>
      </div>

      <div className="flex gap-2 mb-6">
        {(["all", "active", "pending", "closed"] as FilterState[]).map(nextFilter => (
          <button
            key={nextFilter}
            className={`px-3 py-1.5 rounded-lg text-base font-medium transition-colors capitalize ${
              filter === nextFilter ? "pill-active" : "pill-inactive"
            }`}
            onClick={() => setFilter(nextFilter)}
          >
            {nextFilter}
          </button>
        ))}
      </div>

      {!hasGovernorContract && (
        <div className="text-center py-10 text-base-content/60">
          <DocumentTextIcon className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <p className="mb-2">
            A live <code>CuryoGovernor</code> contract is not deployed on this network.
          </p>
          <p className="text-base text-base-content/40">
            Direct registry actions can still be used below when the underlying contract allows them.
          </p>
        </div>
      )}

      {hasGovernorContract && isLoading && (
        <div className="text-center py-10">
          <span className="loading loading-spinner loading-md" />
          <p className="text-base text-base-content/60 mt-2">Loading on-chain proposals...</p>
        </div>
      )}

      {hasGovernorContract && !isLoading && error && (
        <div className="text-center py-10">
          <DocumentTextIcon className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <p className="text-base-content/60 mb-2">Unable to load proposals from chain.</p>
          <p className="text-base text-base-content/40">Check your RPC connection and deployed governor address.</p>
        </div>
      )}

      {hasGovernorContract && !isLoading && !error && filteredProposals.length > 0 && (
        <div className="space-y-4">
          {filteredProposals.map(proposal => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              isActing={isPending && actingProposalId === proposal.proposalId}
              onVote={handleVote}
              onQueue={handleQueue}
              onExecute={handleExecute}
            />
          ))}
        </div>
      )}

      {hasGovernorContract && !isLoading && !error && filteredProposals.length === 0 && (
        <div className="text-center py-10">
          <DocumentTextIcon className="w-12 h-12 text-base-content/20 mx-auto mb-4" />
          <p className="text-base-content/60 mb-2">
            {proposals.length === 0 ? "No on-chain proposals have been created yet." : `No ${filter} proposals found.`}
          </p>
          <p className="text-base text-base-content/40">
            Create a new governance action below to submit the next proposal.
          </p>
        </div>
      )}
    </div>
  );
};
