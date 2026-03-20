"use client";

import { useState } from "react";
import { decodeEventLog, encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { GasBalanceWarning } from "~~/components/shared/GasBalanceWarning";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import {
  getProposalDescriptionHash,
  governorAbi,
  useGovernanceContracts,
  useGovernanceStats,
  useGovernanceWrite,
} from "~~/hooks/useGovernance";
import { getGasBalanceErrorMessage, isInsufficientFundsError } from "~~/lib/transactionErrors";
import { containsBlockedText, containsBlockedUrl } from "~~/utils/contentFilter";
import { notification } from "~~/utils/scaffold-eth";

// Constants from CategoryRegistry contract
const CATEGORY_STAKE = 100n * 1000000n; // 100 cREP (6 decimals)
const MAX_SUBCATEGORIES = 20;
const MAX_SUBCATEGORY_LENGTH = 32;

export const CategorySubmissionForm = () => {
  const { address } = useAccount();
  const wagmiConfig = useConfig();
  const { requireAcceptance } = useTermsAcceptance();
  const { isMissingGasBalance, nativeTokenSymbol } = useGasBalanceStatus();
  const { governorAddress, hasGovernorContract } = useGovernanceContracts();
  const { proposalThreshold } = useGovernanceStats();
  const { writeContractAsync: writeGovernanceContract } = useGovernanceWrite();

  // Form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [subcategories, setSubcategories] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Contract hooks
  const { data: categoryRegistryInfo } = useDeployedContractInfo({ contractName: "CategoryRegistry" });

  const isCategoryRegistryDeployed = !!categoryRegistryInfo?.address;

  const { writeContractAsync: writeCRep } = useScaffoldWriteContract({ contractName: "CuryoReputation" });
  const { writeContractAsync: writeRegistry } = useScaffoldWriteContract({ contractName: "CategoryRegistry" });

  // Check user's cREP balance
  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  const { data: votingPowerRaw } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "getVotes" as any,
    args: [address],
    query: { enabled: !!address },
  });

  const { data: nextCategoryId, refetch: refetchNextCategoryId } = useScaffoldReadContract({
    contractName: "CategoryRegistry",
    functionName: "nextCategoryId" as any,
    query: { enabled: isCategoryRegistryDeployed },
  });

  // Check if domain is already registered
  const { data: isDomainRegistered } = useScaffoldReadContract({
    contractName: "CategoryRegistry",
    functionName: "isDomainRegistered",
    args: [domain],
  });

  const hasEnoughBalance = crepBalance && crepBalance >= CATEGORY_STAKE;
  const votingPower = votingPowerRaw as bigint | undefined;
  const canAutoCreateProposal =
    hasGovernorContract &&
    !!governorAddress &&
    proposalThreshold !== undefined &&
    votingPower !== undefined &&
    votingPower >= proposalThreshold;

  const addSubcategory = () => {
    if (subcategories.length < MAX_SUBCATEGORIES) {
      setSubcategories([...subcategories, ""]);
    }
  };

  const removeSubcategory = (index: number) => {
    if (subcategories.length > 1) {
      setSubcategories(subcategories.filter((_, i) => i !== index));
    }
  };

  const updateSubcategory = (index: number, value: string) => {
    const updated = [...subcategories];
    updated[index] = value.slice(0, MAX_SUBCATEGORY_LENGTH);
    setSubcategories(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !categoryRegistryInfo?.address) return;

    if (isMissingGasBalance) {
      notification.error(getGasBalanceErrorMessage(nativeTokenSymbol));
      return;
    }

    // Validate inputs
    if (!name.trim() || !domain.trim()) {
      notification.error("Please fill in all required fields");
      return;
    }

    const validSubcats = subcategories.filter(s => s.trim());
    if (validSubcats.length === 0) {
      notification.error("Please add at least one category");
      return;
    }

    if (isDomainRegistered) {
      notification.error("This domain is already registered");
      return;
    }

    // Check for prohibited content
    if (containsBlockedText(name).blocked) {
      notification.warning("Platform name contains prohibited content and cannot be submitted");
      return;
    }
    if (containsBlockedUrl(domain).blocked) {
      notification.warning("This domain contains prohibited content and cannot be submitted");
      return;
    }

    // Require terms acceptance
    const accepted = await requireAcceptance("submit");
    if (!accepted) return;

    setIsSubmitting(true);
    let categoryId = nextCategoryId ?? 1n;
    let categorySubmitted = false;
    let proposalCreated = false;
    try {
      // 1. Approve cREP spend
      const approveTxHash = await writeCRep({
        functionName: "approve",
        args: [categoryRegistryInfo.address, CATEGORY_STAKE],
      });

      // Wait for approve tx to be confirmed before submitting
      // (on Anvil automine the transactor returns without waiting for the receipt,
      // so the submitCategory simulation may not yet see the new allowance)
      if (approveTxHash) {
        await waitForTransactionReceipt(wagmiConfig, { hash: approveTxHash });
      }

      // Re-check wallet before second tx
      if (!address) {
        notification.error("Wallet disconnected after approval. Please reconnect and retry.");
        return;
      }

      // 2. Submit category
      const submitTxHash = await writeRegistry({
        functionName: "submitCategory",
        args: [name.trim(), domain.trim().toLowerCase(), validSubcats],
      });
      categorySubmitted = true;
      if (submitTxHash) {
        const submitReceipt = await waitForTransactionReceipt(wagmiConfig, { hash: submitTxHash });
        const submittedLog = submitReceipt.logs.find(log => {
          if (log.address.toLowerCase() !== categoryRegistryInfo.address.toLowerCase()) {
            return false;
          }

          try {
            const decoded = decodeEventLog({
              abi: categoryRegistryInfo.abi,
              data: log.data,
              topics: log.topics,
            });
            return decoded.eventName === "CategorySubmitted";
          } catch {
            return false;
          }
        });

        if (submittedLog?.topics[1]) {
          categoryId = BigInt(submittedLog.topics[1]);
        }
      }
      await refetchNextCategoryId();

      if (canAutoCreateProposal && governorAddress) {
        const proposalDescription = `Approve category #${categoryId}`;
        const approvalCalldata = encodeFunctionData({
          abi: categoryRegistryInfo.abi,
          functionName: "approveCategory",
          args: [categoryId],
        } as any);

        await writeGovernanceContract({
          address: governorAddress,
          abi: governorAbi,
          functionName: "propose",
          args: [[categoryRegistryInfo.address], [0n], [approvalCalldata], proposalDescription],
        });
        proposalCreated = true;

        await writeRegistry({
          functionName: "linkApprovalProposal",
          args: [categoryId, getProposalDescriptionHash(proposalDescription)],
        });

        notification.success("Platform submitted and proposal created.");
      } else {
        notification.success("Platform submitted. Create approval proposal next.");
      }

      // Reset form
      setName("");
      setDomain("");
      setSubcategories([""]);
    } catch (e: any) {
      console.error("Category submission failed:", e);
      if (categorySubmitted) {
        if (proposalCreated) {
          notification.warning(`Platform submitted, but linking failed for category #${categoryId.toString()}.`);
        } else {
          notification.warning("Platform submitted. Approval proposal still needs to be created.");
        }
      } else {
        notification.error(
          isInsufficientFundsError(e)
            ? getGasBalanceErrorMessage(nativeTokenSymbol)
            : e?.shortMessage || "Failed to submit category",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const domainBlockedError = domain && containsBlockedUrl(domain).blocked;
  const nameBlockedError = name && containsBlockedText(name).blocked;

  // Normalize domain input (lowercase, remove www.)
  const handleDomainChange = (value: string) => {
    let normalized = value.toLowerCase().trim();
    if (normalized.startsWith("www.")) {
      normalized = normalized.slice(4);
    }
    setDomain(normalized);
  };

  return (
    <div className="surface-card rounded-2xl p-6 space-y-5">
      <h1 className={surfaceSectionHeadingClassName}>Propose New Platform</h1>

      {!isCategoryRegistryDeployed && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
          <p className="text-base text-warning">CategoryRegistry contract is not deployed. Please deploy it first.</p>
        </div>
      )}

      {isCategoryRegistryDeployed && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Category Name */}
          <div>
            <label className="block text-base font-medium mb-2">Platform Name</label>
            <input
              type="text"
              placeholder="e.g., Reddit"
              className={`input input-bordered w-full bg-base-100 ${nameBlockedError ? "input-error" : ""}`}
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={64}
              required
            />
            {nameBlockedError && <p className="text-error text-base mt-1">Platform name contains prohibited content</p>}
          </div>

          {/* Domain */}
          <div>
            <label className="flex items-center gap-1.5 text-base font-medium mb-2">
              Domain
              <InfoTooltip text="Website domain without www. or https://" />
            </label>
            <input
              type="text"
              placeholder="e.g., reddit.com"
              className={`input input-bordered w-full bg-base-100 ${isDomainRegistered || domainBlockedError ? "input-error" : ""}`}
              value={domain}
              onChange={e => handleDomainChange(e.target.value)}
              maxLength={256}
              required
            />
            {isDomainRegistered && <p className="text-error text-base mt-1">This domain is already registered</p>}
            {domainBlockedError && <p className="text-error text-base mt-1">This domain contains prohibited content</p>}
          </div>

          <div className="bg-info/10 rounded-lg p-4">
            <p className="text-base font-medium text-info mb-2">How Platform Ratings Work</p>
            <ul className="text-base text-base-content/70 space-y-1.5 list-disc list-inside">
              <li>Every content item starts with a neutral community rating and moves up or down through voting.</li>
              <li>
                Voters do not answer a platform-specific question. They judge whether the current rating should rise or
                fall.
              </li>
              <li>Platform categories should still be concrete and easy for voters to evaluate consistently.</li>
              <li>
                Illegal, broken, or misdescribed content should always be downvoted regardless of the current score.
              </li>
            </ul>
          </div>

          {/* Subcategories */}
          <div>
            <label className="block text-base font-medium mb-2">
              Categories <span className="text-base-content/40 font-normal">(1-{MAX_SUBCATEGORIES})</span>
            </label>
            <div className="space-y-2">
              {subcategories.map((subcat, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    placeholder={`Category ${index + 1}`}
                    className="input input-bordered flex-1 bg-base-100"
                    value={subcat}
                    onChange={e => updateSubcategory(index, e.target.value)}
                    maxLength={MAX_SUBCATEGORY_LENGTH}
                  />
                  {subcategories.length > 1 && (
                    <button type="button" onClick={() => removeSubcategory(index)} className="btn btn-ghost btn-square">
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {subcategories.length < MAX_SUBCATEGORIES && (
              <button type="button" onClick={addSubcategory} className="btn btn-ghost mt-2 gap-2">
                <PlusIcon className="w-5 h-5" />
                Add Category
              </button>
            )}
          </div>

          {/* Integration Requirement Notice */}
          <div className="bg-error/10 rounded-lg p-4">
            <p className="text-base font-medium text-error mb-2">Integration Requirement</p>
            <p className="text-base text-base-content/70">
              Platforms must allow content to be embedded and voted on directly within the Curyo interface. Users should
              be able to view and rate content without opening third-party links. Platforms that block embedding or
              require external navigation may be rejected.
            </p>
          </div>

          {/* Content Policy Warning */}
          <div className="bg-error/10 rounded-lg p-4">
            <p className="text-base font-medium text-error mb-2">Content Policy</p>
            <p className="text-base text-base-content/70">
              Platforms that primarily host or facilitate illegal content are prohibited. This includes platforms known
              for: child exploitation, non-consensual imagery, pirated content, illegal drug marketplaces, or terrorism
              promotion. Submitting such platforms will result in immediate stake slashing.
            </p>
          </div>

          {/* Stake info */}
          <div className="surface-card-nested rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="flex items-center gap-1.5 text-base font-medium text-base-content">
                  Platform Stake
                  <InfoTooltip text="Returned if approved by governance, forfeited if rejected. Receive 1% of the losing stakes from the platform" />
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold text-base-content">100</span>
                <span className="ml-1 text-base text-base-content/60">cREP</span>
              </div>
            </div>
            {hasGovernorContract && (
              <p className="text-sm text-base-content/60">
                {canAutoCreateProposal
                  ? "Approval proposal will be created automatically."
                  : "Approval proposal comes next."}
              </p>
            )}
          </div>

          {isMissingGasBalance && <GasBalanceWarning nativeTokenSymbol={nativeTokenSymbol} />}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-submit w-full"
            disabled={
              isSubmitting ||
              isMissingGasBalance ||
              !hasEnoughBalance ||
              !!isDomainRegistered ||
              !name.trim() ||
              !domain.trim() ||
              !!domainBlockedError ||
              !!nameBlockedError
            }
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm"></span>
                Submitting...
              </span>
            ) : (
              "Submit Platform"
            )}
          </button>
        </form>
      )}
    </div>
  );
};
