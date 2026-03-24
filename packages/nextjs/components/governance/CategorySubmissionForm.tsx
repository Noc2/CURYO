"use client";

import { useState } from "react";
import { decodeEventLog } from "viem";
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
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import {
  getGasBalanceErrorMessage,
  isFreeTransactionExhaustedError,
  isInsufficientFundsError,
  isWalletRpcOverloadedError,
} from "~~/lib/transactionErrors";
import { containsBlockedText, containsBlockedUrl } from "~~/utils/contentFilter";
import { notification } from "~~/utils/scaffold-eth";

// Constants from CategoryRegistry contract
const CATEGORY_STAKE = 500n * 1000000n; // 500 cREP (6 decimals)
const CATEGORY_PROPOSAL_THRESHOLD_FALLBACK = 500n * 1000000n; // 500 cREP (6 decimals)
const MAX_SUBCATEGORIES = 20;
const MAX_SUBCATEGORY_LENGTH = 32;

function formatCRep(amount: bigint) {
  return `${(Number(amount) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })} cREP`;
}

export const CategorySubmissionForm = () => {
  const { address } = useAccount();
  const wagmiConfig = useConfig();
  const { requireAcceptance } = useTermsAcceptance();
  const { canSponsorTransactions, isMissingGasBalance, nativeTokenSymbol } = useGasBalanceStatus({
    includeExternalSendCalls: true,
  });
  const { governorAddress, hasGovernorContract } = useGovernanceContracts();
  const { categoryProposalThreshold: categoryProposalThresholdRaw } = useGovernanceStats();
  const { writeContractAsync: writeGovernanceContract } = useGovernanceWrite();
  const { canUseSponsoredSubmitCalls, executeSponsoredCalls, isAwaitingSponsoredSubmitCalls } =
    useThirdwebSponsoredSubmitCalls();
  const { showWalletRpcOverloadNotification } = useWalletRpcRecovery();

  // Form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [subcategories, setSubcategories] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Contract hooks
  const { data: categoryRegistryInfo, isLoading: isCategoryRegistryLoading } = useDeployedContractInfo({
    contractName: "CategoryRegistry",
  });
  const { data: crepInfo, isLoading: isCrepLoading } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const categoryRegistryAddress = categoryRegistryInfo?.address as `0x${string}` | undefined;
  const crepAddress = crepInfo?.address as `0x${string}` | undefined;
  const governorContractAddress = governorAddress as `0x${string}` | undefined;

  const isCategoryRegistryDeployed = !!categoryRegistryAddress;
  const isCategorySubmissionLoading = isCategoryRegistryLoading || isCrepLoading;

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

  const categoryProposalThreshold = hasGovernorContract
    ? (categoryProposalThresholdRaw ?? CATEGORY_PROPOSAL_THRESHOLD_FALLBACK)
    : 0n;
  const submitsWithProposal = hasGovernorContract && !!governorAddress;
  const totalRequiredBalance = submitsWithProposal ? CATEGORY_STAKE + categoryProposalThreshold : CATEGORY_STAKE;
  const hasEnoughBalance = crepBalance !== undefined && crepBalance >= totalRequiredBalance;
  const votingPower = votingPowerRaw as bigint | undefined;
  const hasEnoughVotingPowerForProposal =
    !submitsWithProposal || (votingPower !== undefined && votingPower >= categoryProposalThreshold);
  const canAutoCreateProposal = submitsWithProposal && hasEnoughBalance && hasEnoughVotingPowerForProposal;
  const canSubmitCategory = !submitsWithProposal ? hasEnoughBalance : canAutoCreateProposal;

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
    if (!address || !categoryRegistryInfo || !categoryRegistryAddress) return;

    if (isAwaitingSponsoredSubmitCalls) {
      notification.warning("Wallet reconnecting. Retry in a moment.");
      return;
    }

    if (isMissingGasBalance) {
      notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
      return;
    }

    if (submitsWithProposal && !canSubmitCategory) {
      if (!hasEnoughVotingPowerForProposal) {
        notification.error(`You need ${formatCRep(categoryProposalThreshold)} voting power to submit a platform.`);
      } else {
        notification.error(`You need ${formatCRep(totalRequiredBalance)} total to submit a platform.`);
      }
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
      if (canUseSponsoredSubmitCalls && crepInfo && crepAddress) {
        const callsResult = await executeSponsoredCalls(
          [
            {
              abi: crepInfo.abi,
              address: crepAddress,
              args: [categoryRegistryAddress, CATEGORY_STAKE],
              functionName: "approve",
            },
            {
              abi: categoryRegistryInfo.abi,
              address: categoryRegistryAddress,
              args: [name.trim(), domain.trim().toLowerCase(), validSubcats],
              functionName: "submitCategory",
            },
          ],
          { atomicRequired: true },
        );

        const submittedLog = (callsResult.receipts ?? [])
          .flatMap(receipt => receipt.logs)
          .find(log => {
            if (log.address.toLowerCase() !== categoryRegistryInfo.address.toLowerCase()) {
              return false;
            }

            try {
              if (log.topics.length === 0) {
                return false;
              }

              const decoded = decodeEventLog({
                abi: categoryRegistryInfo.abi,
                data: log.data as `0x${string}`,
                topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
              });
              return decoded.eventName === "CategorySubmitted";
            } catch {
              return false;
            }
          });

        if (submittedLog?.topics[1]) {
          categoryId = BigInt(submittedLog.topics[1]);
        }
        categorySubmitted = true;
      } else {
        const approveTxHash = await writeCRep({
          functionName: "approve",
          args: [categoryRegistryAddress, CATEGORY_STAKE],
        });

        if (approveTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: approveTxHash });
        }

        if (!address) {
          notification.error("Wallet disconnected after approval. Please reconnect and retry.");
          return;
        }

        const submitTxHash = await writeRegistry({
          functionName: "submitCategory",
          args: [name.trim(), domain.trim().toLowerCase(), validSubcats],
        });
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
        categorySubmitted = true;
      }

      await refetchNextCategoryId();

      if (canAutoCreateProposal && governorContractAddress) {
        const proposalDescription = `Approve category #${categoryId}`;
        const proposalDescriptionHash = getProposalDescriptionHash(proposalDescription);

        if (canUseSponsoredSubmitCalls) {
          await executeSponsoredCalls(
            [
              {
                abi: governorAbi,
                address: governorContractAddress,
                args: [categoryId],
                functionName: "proposeCategoryApproval",
              },
              {
                abi: categoryRegistryInfo.abi,
                address: categoryRegistryAddress,
                args: [categoryId, proposalDescriptionHash],
                functionName: "linkApprovalProposal",
              },
            ],
            { atomicRequired: true },
          );
        } else {
          await writeGovernanceContract({
            address: governorContractAddress,
            abi: governorAbi,
            functionName: "proposeCategoryApproval",
            args: [categoryId],
          });
          await writeRegistry({
            functionName: "linkApprovalProposal",
            args: [categoryId, proposalDescriptionHash],
          });
        }
        proposalCreated = true;

        notification.success("Platform submitted and proposal created.");
      } else {
        notification.success("Platform submitted.");
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
        if (isFreeTransactionExhaustedError(e) || isInsufficientFundsError(e)) {
          notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
        } else if (isWalletRpcOverloadedError(e)) {
          showWalletRpcOverloadNotification();
        } else {
          notification.error(e?.shortMessage || e?.message || "Failed to submit category");
        }
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

      {isCategorySubmissionLoading && (
        <div className="flex items-center gap-3 rounded-lg bg-base-200 p-4 text-base-content/60">
          <span className="loading loading-spinner loading-sm text-primary" />
          <p className="text-base">Loading platform submission...</p>
        </div>
      )}

      {!isCategorySubmissionLoading && !isCategoryRegistryDeployed && (
        <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
          <p className="text-base text-warning">Platform submissions are unavailable right now.</p>
        </div>
      )}

      {!isCategorySubmissionLoading && isCategoryRegistryDeployed && (
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
                <span className="text-xl font-bold text-base-content">500</span>
                <span className="ml-1 text-base text-base-content/60">cREP</span>
              </div>
            </div>
            {hasGovernorContract && (
              <div className="space-y-2 text-sm text-base-content/60">
                <div className="flex items-center justify-between gap-3">
                  <span>Platform stake</span>
                  <span className="font-medium text-base-content">{formatCRep(CATEGORY_STAKE)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>Category proposal lock</span>
                  <span className="font-medium text-base-content">{formatCRep(categoryProposalThreshold)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-base-content/10 pt-2">
                  <span>Total to submit</span>
                  <span className="font-medium text-base-content">{formatCRep(totalRequiredBalance)}</span>
                </div>
                <p>Submit creates the approval proposal immediately.</p>
                {!hasEnoughVotingPowerForProposal && (
                  <p className="text-warning">Need {formatCRep(categoryProposalThreshold)} voting power.</p>
                )}
                {!hasEnoughBalance && (
                  <p className="text-warning">Need {formatCRep(totalRequiredBalance)} available balance.</p>
                )}
              </div>
            )}
          </div>

          {isMissingGasBalance && <GasBalanceWarning nativeTokenSymbol={nativeTokenSymbol} />}

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-submit w-full"
            disabled={
              isSubmitting ||
              isAwaitingSponsoredSubmitCalls ||
              isMissingGasBalance ||
              !canSubmitCategory ||
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
