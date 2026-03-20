"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { useQueryClient } from "@tanstack/react-query";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { ProposalCard } from "~~/components/governance/ProposalCard";
import { Proposal, ProposalState } from "~~/components/governance/types";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import {
  governorAbi,
  useGovernanceContracts,
  useGovernanceStats,
  useGovernanceWrite,
  useGovernorProposals,
} from "~~/hooks/useGovernance";
import scaffoldConfig from "~~/scaffold.config";

const OPEN_PROPOSAL_STATES = new Set([
  ProposalState.Pending,
  ProposalState.Active,
  ProposalState.Succeeded,
  ProposalState.Queued,
]);

function formatVotingPower(amount: bigint | undefined) {
  if (amount === undefined) return "—";
  return `${(Number(amount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} cREP`;
}

function getFrontendStatusLabel({
  isRegistered,
  isApproved,
  isSlashed,
  hasOpenProposal,
}: {
  isRegistered: boolean;
  isApproved: boolean;
  isSlashed: boolean;
  hasOpenProposal: boolean;
}) {
  if (!isRegistered) {
    return { label: "Not registered", className: "bg-base-200 text-base-content/70" };
  }

  if (isSlashed) {
    return { label: "Slashed", className: "bg-error/15 text-error" };
  }

  if (isApproved) {
    return { label: "Approved", className: "bg-success/15 text-success" };
  }

  if (hasOpenProposal) {
    return { label: "In vote", className: "bg-primary/15 text-primary" };
  }

  return { label: "Pending approval", className: "bg-warning/15 text-warning" };
}

export function FrontendApprovalCard() {
  const queryClient = useQueryClient();
  const { address } = useAccount();
  const wagmiConfig = useConfig();
  const { governorAddress, hasGovernorContract, knownContractsByName } = useGovernanceContracts();
  const { proposalThreshold } = useGovernanceStats();
  const { data: proposals = [], isLoading: proposalsLoading } = useGovernorProposals();
  const { writeContractAsync, isPending } = useGovernanceWrite();
  const [actingProposalId, setActingProposalId] = useState<bigint | null>(null);

  const targetFrontend = scaffoldConfig.frontendCode ?? address;
  const isDeploymentFrontend = !!scaffoldConfig.frontendCode;

  const { data: frontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [targetFrontend],
    query: { enabled: !!targetFrontend },
  });

  const { data: votingPowerRaw } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "getVotes" as any,
    args: [address],
    query: { enabled: !!address },
  });

  const votingPower = votingPowerRaw as bigint | undefined;
  const frontendRegistryContract = knownContractsByName.FrontendRegistry;
  const targetFrontendLower = targetFrontend?.toLowerCase();

  const approvalCalldata = useMemo(() => {
    if (!frontendRegistryContract || !targetFrontend) {
      return null;
    }

    return encodeFunctionData({
      abi: frontendRegistryContract.abi,
      functionName: "approveFrontend",
      args: [targetFrontend],
    } as any);
  }, [frontendRegistryContract, targetFrontend]);

  const matchingApprovalProposals = useMemo(() => {
    if (!frontendRegistryContract || !targetFrontendLower || !approvalCalldata) {
      return [] as Proposal[];
    }

    return proposals.filter(proposal =>
      proposal.actions.some(
        action =>
          action.target.toLowerCase() === frontendRegistryContract.address.toLowerCase() &&
          action.functionName === "approveFrontend" &&
          action.calldata.toLowerCase() === approvalCalldata.toLowerCase(),
      ),
    );
  }, [approvalCalldata, frontendRegistryContract, proposals, targetFrontendLower]);

  const openApprovalProposals = useMemo(
    () => matchingApprovalProposals.filter(proposal => OPEN_PROPOSAL_STATES.has(proposal.state)),
    [matchingApprovalProposals],
  );

  const isRegistered = Boolean(frontendInfo && frontendInfo[1] > 0n);
  const isApproved = Boolean(frontendInfo && frontendInfo[2]);
  const isSlashed = Boolean(frontendInfo && frontendInfo[3]);
  const canCreateApprovalProposal =
    !!targetFrontend &&
    isRegistered &&
    !isApproved &&
    !isSlashed &&
    openApprovalProposals.length === 0 &&
    !!governorAddress &&
    !!frontendRegistryContract &&
    hasGovernorContract &&
    proposalThreshold !== undefined &&
    votingPower !== undefined &&
    votingPower >= proposalThreshold;

  const status = getFrontendStatusLabel({
    isRegistered,
    isApproved,
    isSlashed,
    hasOpenProposal: openApprovalProposals.length > 0,
  });

  const refreshProposals = async () => {
    await queryClient.invalidateQueries({ queryKey: ["governor-proposals"] });
  };

  const handleCreateProposal = async () => {
    if (!targetFrontend || !governorAddress || !frontendRegistryContract) {
      return;
    }

    const calldata = encodeFunctionData({
      abi: frontendRegistryContract.abi,
      functionName: "approveFrontend",
      args: [targetFrontend],
    } as any);

    const txHash = await writeContractAsync({
      address: governorAddress,
      abi: governorAbi,
      functionName: "propose",
      args: [[frontendRegistryContract.address], [0n], [calldata], `Approve frontend ${targetFrontend}`],
    });

    if (!txHash) {
      return;
    }

    await waitForTransactionReceipt(wagmiConfig, { hash: txHash });
    await refreshProposals();
  };

  const handleVote = async (proposalId: bigint, support: 0 | 1 | 2) => {
    if (!governorAddress) {
      return;
    }

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
    if (!governorAddress) {
      return;
    }

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
    if (!governorAddress) {
      return;
    }

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

  return (
    <div className="surface-card rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className={surfaceSectionHeadingClassName}>Frontend Approval</h2>
          <p className="text-base text-base-content/60">Register on Submit. Approve and vote here.</p>
        </div>
        <Link href="/submit#frontend" className="btn btn-ghost btn-sm">
          Open Submit
        </Link>
      </div>

      {!targetFrontend ? (
        <div className="bg-base-200 rounded-xl p-4 text-base text-base-content/60">
          Connect the frontend operator wallet to continue.
        </div>
      ) : (
        <>
          <div className="bg-base-200 rounded-xl p-4 flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1">
              <p className="text-base text-base-content/50">
                {isDeploymentFrontend ? "Deployment frontend" : "Frontend"}
              </p>
              <Address address={targetFrontend} />
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 rounded-full text-base font-medium ${status.className}`}>{status.label}</span>
            </div>
          </div>

          {!isRegistered && (
            <div className="bg-base-200 rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
              <p className="text-base text-base-content/60">This frontend is not registered yet.</p>
              <Link href="/submit#frontend" className="btn btn-primary btn-sm">
                Register
              </Link>
            </div>
          )}

          {isRegistered && !isApproved && !isSlashed && openApprovalProposals.length === 0 && (
            <div className="bg-base-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-1">
                  <p className="font-medium">Approval proposal</p>
                  <p className="text-base text-base-content/60">Create the governor proposal for this frontend.</p>
                </div>
                <button
                  className="btn btn-primary btn-sm"
                  disabled={!canCreateApprovalProposal || isPending}
                  onClick={handleCreateProposal}
                >
                  Create Proposal
                </button>
              </div>
              <div className="flex gap-4 flex-wrap text-base text-base-content/50">
                <span>Your voting power: {formatVotingPower(votingPower)}</span>
                <span>Threshold: {formatVotingPower(proposalThreshold)}</span>
              </div>
              {!hasGovernorContract && <p className="text-base text-warning">Governor unavailable on this network.</p>}
              {hasGovernorContract &&
                proposalThreshold !== undefined &&
                votingPower !== undefined &&
                votingPower < proposalThreshold && (
                  <p className="text-base text-warning">You need more voting power to create this proposal.</p>
                )}
            </div>
          )}

          {proposalsLoading && openApprovalProposals.length === 0 && (
            <div className="text-center py-6">
              <span className="loading loading-spinner loading-md" />
              <p className="mt-2 text-base text-base-content/60">Loading frontend proposals...</p>
            </div>
          )}

          {openApprovalProposals.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="font-medium">Frontend proposal{openApprovalProposals.length === 1 ? "" : "s"}</p>
                <p className="text-base text-base-content/60">Vote for the approval proposal below.</p>
              </div>
              {openApprovalProposals.map(proposal => (
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

          {isApproved && openApprovalProposals.length === 0 && (
            <div className="bg-base-200 rounded-xl p-4 text-base text-base-content/60">
              This frontend is already approved.
            </div>
          )}
        </>
      )}
    </div>
  );
}
