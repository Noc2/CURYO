"use client";

import { useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { PlusIcon, TrashIcon } from "@heroicons/react/24/outline";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import {
  RATING_PLACEHOLDER,
  TITLE_PLACEHOLDER,
  renderRankingQuestion,
  validateRankingQuestionTemplate,
} from "~~/lib/categories/rankingQuestionTemplate";
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

  // Form state
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [rankingQuestion, setRankingQuestion] = useState("");
  const [subcategories, setSubcategories] = useState<string[]>([""]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Contract hooks
  const { data: categoryRegistryInfo } = useDeployedContractInfo({ contractName: "CategoryRegistry" });

  const { writeContractAsync: writeCRep } = useScaffoldWriteContract({ contractName: "CuryoReputation" });
  const { writeContractAsync: writeRegistry } = useScaffoldWriteContract({ contractName: "CategoryRegistry" });

  // Check user's cREP balance
  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  // Check if domain is already registered
  const { data: isDomainRegistered } = useScaffoldReadContract({
    contractName: "CategoryRegistry",
    functionName: "isDomainRegistered",
    args: [domain],
  });

  const hasEnoughBalance = crepBalance && crepBalance >= CATEGORY_STAKE;
  const isCategoryRegistryDeployed = !!categoryRegistryInfo?.address;
  const rankingQuestionValidation = validateRankingQuestionTemplate(rankingQuestion);
  const rankingQuestionError = !rankingQuestion.trim()
    ? null
    : !rankingQuestionValidation.hasTitlePlaceholder
      ? `Ranking question must include ${TITLE_PLACEHOLDER}`
      : !rankingQuestionValidation.hasRatingPlaceholder
        ? `Ranking question must include ${RATING_PLACEHOLDER}`
        : null;
  const rankingQuestionPreview = renderRankingQuestion(rankingQuestion, {
    title: name.trim() || "Bitcoin",
    rating: 50,
    fallbackLabel: "content",
  });

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

    // Validate inputs
    if (!name.trim() || !domain.trim() || !rankingQuestion.trim()) {
      notification.error("Please fill in all required fields");
      return;
    }

    if (!rankingQuestionValidation.isValid) {
      notification.error(`Ranking question must include both ${TITLE_PLACEHOLDER} and ${RATING_PLACEHOLDER}`);
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
      await writeRegistry({
        functionName: "submitCategory",
        args: [name.trim(), domain.trim().toLowerCase(), validSubcats, rankingQuestion.trim()],
      });

      notification.success(
        "Platform submitted. Next: have a sponsor create an approval proposal, then link it from this same wallet. If no proposal is linked within 7 days, you can cancel and reclaim your stake.",
      );

      // Reset form
      setName("");
      setDomain("");
      setRankingQuestion("");
      setSubcategories([""]);
    } catch (e: any) {
      console.error("Category submission failed:", e);
      notification.error(e?.shortMessage || "Failed to submit category");
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

          {/* Ranking Question */}
          <div>
            <label className="flex items-center gap-1.5 text-base font-medium mb-2">
              Ranking Question
              <InfoTooltip text="Question shown to voters when rating content. Use both {title} and {rating}. Example: 'Are the fundamentals of {title} strong enough to score above {rating} out of 100?'" />
            </label>
            <input
              type="text"
              placeholder="e.g., Are the fundamentals of {title} strong enough to score above {rating} out of 100?"
              className={`input input-bordered w-full bg-base-100 ${rankingQuestionError ? "input-error" : ""}`}
              value={rankingQuestion}
              onChange={e => setRankingQuestion(e.target.value)}
              maxLength={256}
              required
            />
            {rankingQuestionError && <p className="text-error text-base mt-1">{rankingQuestionError}</p>}
            {/* Ranking Question Guidance */}
            <div className="bg-info/10 rounded-lg p-4 mt-3">
              <p className="text-base font-medium text-info mb-2">Writing a Good Ranking Question</p>
              <ul className="text-base text-base-content/70 space-y-1.5 list-disc list-inside">
                <li>
                  Use <code className="bg-base-300/50 px-1 rounded text-sm">{"{title}"}</code> for the content title and{" "}
                  <code className="bg-base-300/50 px-1 rounded text-sm ml-1">{"{rating}"}</code> for the current score.
                </li>
                <li>Both placeholders are required so every frontend can render the exact same question.</li>
                <li>
                  <strong>Good:</strong> &ldquo;Is {"{title}"} informative enough to score above {"{rating}"} out of
                  100?&rdquo;
                </li>
                <li>
                  <strong>Avoid:</strong> &ldquo;Do you like this video?&rdquo; (too subjective, missing both
                  placeholders)
                </li>
                <li>
                  Questions with clear evaluation criteria help voters reach consensus and produce more accurate
                  ratings.
                </li>
              </ul>
            </div>
            <div className="bg-base-300/30 rounded-lg p-4 mt-3">
              <p className="text-base font-medium text-base-content mb-1.5">Preview</p>
              <p className="text-base text-base-content/75">{rankingQuestionPreview}</p>
            </div>
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
          <div
            className="rounded-2xl p-4"
            style={{
              background: "#112840",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="flex items-center gap-1.5 text-base font-medium text-white">
                  Platform Stake
                  <InfoTooltip text="Returned if approved by governance, forfeited if rejected. Receive 1% of the losing stakes from the platform" />
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold text-white">100</span>
                <span className="text-base text-white/60 ml-1">cREP</span>
              </div>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-submit w-full"
            disabled={
              isSubmitting ||
              !hasEnoughBalance ||
              !!isDomainRegistered ||
              !name.trim() ||
              !domain.trim() ||
              !rankingQuestion.trim() ||
              !rankingQuestionValidation.isValid ||
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
