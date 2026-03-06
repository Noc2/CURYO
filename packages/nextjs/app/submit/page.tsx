"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { NextPage } from "next";
import { useAccount } from "wagmi";
import { ChevronDownIcon, IdentificationIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { CategorySubmissionForm } from "~~/components/governance/CategorySubmissionForm";
import { FrontendRegistration } from "~~/components/governance/FrontendRegistration";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { ShareModal } from "~~/components/submit/ShareModal";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { serializeTags } from "~~/constants/categories";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import {
  useDeployedContractInfo,
  useScaffoldEventHistory,
  useScaffoldReadContract,
  useScaffoldWriteContract,
} from "~~/hooks/scaffold-eth";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import {
  Category,
  extractDomain,
  getCategoryIdFromUrl,
  resolveCanonicalDomain,
  useCategoryRegistry,
} from "~~/hooks/useCategoryRegistry";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { ponderApi } from "~~/services/ponder/client";
import { containsBlockedText, containsBlockedUrl } from "~~/utils/contentFilter";
import { canonicalizeUrl, isSupportedVideoPlatform } from "~~/utils/platforms";
import { publicEnv } from "~~/utils/env/public";
import { notification } from "~~/utils/scaffold-eth";

type SubmissionType = "content" | "category" | "frontend";

// Platform-specific configuration for URL input
const PLATFORM_CONFIG: Record<string, { urlPlaceholder: string; urlHint: string }> = {
  "youtube.com": {
    urlPlaceholder: "https://youtube.com/watch?v=dQw4w9WgXcQ",
    urlHint: "Paste a YouTube video URL",
  },
  "twitch.tv": {
    urlPlaceholder: "https://twitch.tv/videos/123456789",
    urlHint: "Paste a Twitch video or clip URL",
  },
  "scryfall.com": {
    urlPlaceholder: "https://scryfall.com/card/lea/232/black-lotus",
    urlHint: "Paste a Scryfall card URL",
  },
  "en.wikipedia.org": {
    urlPlaceholder: "https://en.wikipedia.org/wiki/Lionel_Messi",
    urlHint: "Paste a Wikipedia article URL for a person",
  },
  "rawg.io": {
    urlPlaceholder: "https://rawg.io/games/elden-ring",
    urlHint: "Paste a RAWG game page URL",
  },
  "openlibrary.org": {
    urlPlaceholder: "https://openlibrary.org/works/OL45804W/Fahrenheit_451",
    urlHint: "Paste an Open Library book URL",
  },
  "www.themoviedb.org": {
    urlPlaceholder: "https://www.themoviedb.org/movie/238-the-godfather",
    urlHint: "Paste a TMDB movie URL",
  },
  "coingecko.com": {
    urlPlaceholder: "https://www.coingecko.com/en/coins/bitcoin",
    urlHint: "Paste a CoinGecko token page URL",
  },
  "huggingface.co": {
    urlPlaceholder: "https://huggingface.co/Qwen/Qwen3.5-397B-A17B",
    urlHint: "Paste a Hugging Face model URL",
  },
  "x.com": {
    urlPlaceholder: "https://x.com/elonmusk/status/1234567890",
    urlHint: "Paste a tweet URL",
  },
  "twitter.com": {
    urlPlaceholder: "https://twitter.com/elonmusk/status/1234567890",
    urlHint: "Paste a tweet URL",
  },
  "github.com": {
    urlPlaceholder: "https://github.com/ethereum/go-ethereum",
    urlHint: "Paste a GitHub repository URL",
  },
};

const DEFAULT_URL_CONFIG = {
  urlPlaceholder: "https://...",
  urlHint: "Select a platform first, then paste your URL",
};

// Platform favicon using Google's favicon service
function PlatformIcon({ domain, className }: { domain: string; className?: string }) {
  const iconClass = className || "w-4 h-4";
  // Strip leading "www." / "en." etc. to get the root domain for favicon lookup
  const faviconDomain = domain.replace(/^(www\.|en\.)/, "");
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${faviconDomain}&sz=64`}
      alt={`${domain} icon`}
      className={`${iconClass} rounded-sm`}
      loading="lazy"
    />
  );
}

const SubmitPage: NextPage = () => {
  const rpcFallbackEnabled = publicEnv.rpcFallbackEnabled;
  const { address } = useAccount();
  const { hasVoterId, isLoading: voterIdLoading } = useVoterIdNFT(address);
  const { ratePercent, calculateBonus } = useParticipationRate();
  const submissionBonus = calculateBonus(10);
  const { requireAcceptance } = useTermsAcceptance();

  // Submission type tab
  const [submissionType, setSubmissionType] = useState<SubmissionType>("content");

  // Sync tab with URL hash (e.g. /submit#category)
  const selectTab = useCallback((tab: SubmissionType) => {
    setSubmissionType(tab);
    const hash = tab === "content" ? "" : `#${tab}`;
    history.replaceState(null, "", hash || window.location.pathname + window.location.search);
  }, []);

  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "") as SubmissionType;
      if (hash && ["content", "category", "frontend"].includes(hash)) {
        setSubmissionType(hash);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  // Content form state
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [goalError, setGoalError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [customSubcategory, setCustomSubcategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedContent, setSubmittedContent] = useState<{ id: bigint; goal: string } | null>(null);

  // Platform dropdown state
  const [platformSearch, setPlatformSearch] = useState("");
  const [isPlatformDropdownOpen, setIsPlatformDropdownOpen] = useState(false);
  const platformDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch approved categories from CategoryRegistry
  const { categories: websiteCategories, domainToCategoryId, isLoading: categoriesLoading } = useCategoryRegistry();

  // Close platform dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(event.target as Node)) {
        setIsPlatformDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter platforms based on search
  const filteredPlatforms = useMemo(() => {
    if (!platformSearch.trim()) return websiteCategories;
    const search = platformSearch.toLowerCase();
    return websiteCategories.filter(
      cat => cat.name.toLowerCase().includes(search) || cat.domain.toLowerCase().includes(search),
    );
  }, [websiteCategories, platformSearch]);

  // Auto-detect categoryId from URL domain
  const detectedCategoryId = useMemo(() => {
    if (!url || urlError) return 0n;
    return getCategoryIdFromUrl(url, domainToCategoryId);
  }, [url, urlError, domainToCategoryId]);

  // Get detected category details for display
  const detectedCategory = useMemo(() => {
    if (detectedCategoryId === 0n) return null;
    return websiteCategories.find(cat => cat.id === detectedCategoryId);
  }, [detectedCategoryId, websiteCategories]);

  // Auto-select category when URL changes
  useEffect(() => {
    if (detectedCategory && (!selectedCategory || selectedCategory.id !== detectedCategory.id)) {
      setSelectedCategory(detectedCategory);
      setSelectedSubcategories([]);
    }
  }, [detectedCategory, selectedCategory]);

  // Check if URL matches selected category (alias-aware)
  const urlCategoryMismatch = useMemo(() => {
    if (!url || urlError || !selectedCategory) return false;
    try {
      const urlDomain = extractDomain(url);
      if (!urlDomain) return false;
      return resolveCanonicalDomain(urlDomain) !== resolveCanonicalDomain(selectedCategory.domain);
    } catch {
      return false;
    }
  }, [url, urlError, selectedCategory]);

  // Get platform-specific URL config
  const urlConfig = useMemo(() => {
    if (!selectedCategory) return DEFAULT_URL_CONFIG;
    return (
      PLATFORM_CONFIG[selectedCategory.domain] ??
      PLATFORM_CONFIG[resolveCanonicalDomain(selectedCategory.domain)] ??
      DEFAULT_URL_CONFIG
    );
  }, [selectedCategory]);

  const validateUrl = (value: string) => {
    if (!value) {
      setUrlError(null);
      return;
    }

    try {
      new URL(value);

      // Check for prohibited content in URL
      const urlCheck = containsBlockedUrl(value);
      if (urlCheck.blocked) {
        setUrlError("This URL contains prohibited content and cannot be submitted");
        return;
      }

      // Check against approved platforms from CategoryRegistry
      if (domainToCategoryId.size > 0) {
        // Use dynamic category validation
        const categoryId = getCategoryIdFromUrl(value, domainToCategoryId);
        if (categoryId === 0n) {
          const platformNames = websiteCategories.map(c => c.name).join(", ");
          setUrlError(`Please enter a URL from an approved platform (${platformNames})`);
        } else {
          setUrlError(null);
        }
      } else {
        // Fallback to static validation if categories not loaded
        if (!isSupportedVideoPlatform(value)) {
          setUrlError("Please enter a URL from YouTube or Twitch");
        } else {
          setUrlError(null);
        }
      }
    } catch {
      setUrlError("Please enter a valid URL");
    }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setUrl(value);
    if (value) validateUrl(value);
    else setUrlError(null);
  };

  const isValidUrl = url && !urlError;

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setSelectedSubcategories([]);
    // Clear URL if it doesn't match the newly selected platform
    if (url) {
      try {
        const urlDomain = extractDomain(url);
        if (urlDomain && resolveCanonicalDomain(urlDomain) !== resolveCanonicalDomain(category.domain)) {
          setUrl("");
          setUrlError(null);
        }
      } catch {
        // Keep URL if extraction fails
      }
    }
  };

  const handleSubcategoryToggle = (subcategory: string) => {
    setSelectedSubcategories(prev => {
      if (prev.includes(subcategory)) {
        return prev.filter(s => s !== subcategory);
      }
      if (prev.length < 3) {
        return [...prev, subcategory];
      }
      return prev;
    });
  };

  const handleAddCustomSubcategory = () => {
    const trimmed = customSubcategory.trim();
    if (trimmed && !selectedSubcategories.includes(trimmed) && selectedSubcategories.length < 3) {
      setSelectedSubcategories(prev => [...prev, trimmed]);
      setCustomSubcategory("");
    }
  };

  const { writeContractAsync: writeCRep } = useScaffoldWriteContract({ contractName: "CuryoReputation" });
  const { writeContractAsync: writeRegistry } = useScaffoldWriteContract({
    contractName: "ContentRegistry",
    disableSimulate: true,
  });
  const { data: registryInfo } = useDeployedContractInfo({ contractName: "ContentRegistry" });
  const { data: crepInfo } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const { data: nextContentId, refetch: refetchNextContentId } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "nextContentId",
  });
  const { data: existingContentEvents } = useScaffoldEventHistory({
    contractName: "ContentRegistry",
    eventName: "ContentSubmitted",
    fromBlock: 0n,
    watch: false,
    enabled: rpcFallbackEnabled,
  });

  // Check if URL is already submitted by querying Ponder, with an optional RPC fallback for local development.
  const { data: existingContent } = usePonderQuery({
    queryKey: ["submittedContent", url],
    enabled: Boolean(url) && !urlError,
    ponderFn: async () => {
      const existingItems = await ponderApi.getAllContent({ status: "all" });
      return existingItems.map(item => item.url);
    },
    rpcFn: async () => existingContentEvents?.map(event => event.args.url ?? "").filter(Boolean) ?? [],
    rpcEnabled: rpcFallbackEnabled,
    staleTime: 30_000,
  });

  const isUrlAlreadySubmitted = !!(
    url &&
    !urlError &&
    existingContent?.data?.some(existingUrl => canonicalizeUrl(existingUrl) === canonicalizeUrl(url))
  );

  const handleGoalChange = (value: string) => {
    setGoal(value);
    const check = containsBlockedText(value);
    setGoalError(check.blocked ? "Your description contains prohibited content" : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !registryInfo?.address || !isValidUrl || !selectedCategory) return;

    if (urlCategoryMismatch) {
      notification.error("URL doesn't match the selected platform");
      return;
    }

    // Check goal text for prohibited content
    if (containsBlockedText(goal).blocked) {
      notification.warning("Your title/description contains prohibited content and cannot be submitted");
      return;
    }

    if (!crepInfo?.address) {
      notification.error("cREP token contract not deployed");
      return;
    }

    // Require terms acceptance before submitting
    const accepted = await requireAcceptance("submit");
    if (!accepted) return;

    setIsSubmitting(true);
    const submittedGoal = goal; // Save goal before clearing
    try {
      // Capture the contentId that will be assigned (nextContentId before submission)
      const contentId = nextContentId ?? BigInt(1);

      // 10 cREP with 6 decimals
      const stakeAmount = BigInt(10 * 1e6);

      // Approve and submit with cREP
      // Wait for approve to be confirmed before submitting, otherwise the sequencer
      // may see a stale nonce and reject the second tx with "nonce too low"
      await writeCRep(
        { functionName: "approve", args: [registryInfo.address, stakeAmount] },
        { blockConfirmations: 1 },
      );
      // Brief delay to let the sequencer's nonce state catch up after the approve tx
      await new Promise(resolve => setTimeout(resolve, 2000));
      const canonicalUrl = canonicalizeUrl(url);
      await writeRegistry({
        functionName: "submitContent",
        args: [canonicalUrl, goal, serializeTags(selectedSubcategories), selectedCategory.id],
      });

      // Refetch to update the nextContentId for future submissions
      await refetchNextContentId();

      notification.success("Content submitted! Staked 10 cREP.");

      // Show share modal
      setSubmittedContent({ id: contentId, goal: submittedGoal });

      // Clear form
      setUrl("");
      setUrlError(null);
      setGoal("");
      setGoalError(null);
      setSelectedCategory(null);
      setSelectedSubcategories([]);
      setCustomSubcategory("");
    } catch (e: unknown) {
      console.error("Submit failed:", e);
      notification.error("Failed to submit content");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseShareModal = () => {
    setSubmittedContent(null);
  };

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center grow px-6 pt-20">
        <div className="surface-card rounded-2xl p-8 text-center max-w-sm">
          <h1 className="text-2xl font-semibold mb-3">Submit</h1>
          <p className="text-base-content/50 mb-6 text-base">
            Connect your wallet to submit content or propose new categories.
          </p>
          <RainbowKitCustomConnectButton />
        </div>
      </div>
    );
  }

  if (voterIdLoading) {
    return (
      <div className="flex flex-col items-center justify-center grow px-6 pt-20">
        <div className="surface-card rounded-2xl p-8 text-center max-w-sm">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="text-base-content/50 mt-4">Loading verification status...</p>
        </div>
      </div>
    );
  }

  if (!hasVoterId) {
    return (
      <div className="flex flex-col items-center justify-center grow px-6 pt-20">
        <div className="surface-card rounded-2xl p-8 text-center max-w-md space-y-4">
          <IdentificationIcon className="w-12 h-12 text-warning mx-auto" />
          <h1 className="text-2xl font-semibold">Voter ID Required</h1>
          <p className="text-base-content/60">
            You need a Voter ID to submit content, propose platforms, or register as a frontend operator. Verify your
            identity with Self.xyz to receive your Voter ID.
          </p>
          <Link href="/governance" className="btn btn-submit">
            <IdentificationIcon className="w-5 h-5" />
            Get Voter ID
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center grow px-4 pt-8 pb-12">
      <div className="w-full max-w-lg">
        {/* Submission Type Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => selectTab("content")}
            className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
              submissionType === "content" ? "pill-active" : "bg-base-200 text-white hover:bg-base-300"
            }`}
          >
            Content
          </button>
          <button
            onClick={() => selectTab("category")}
            className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
              submissionType === "category" ? "pill-active" : "bg-base-200 text-white hover:bg-base-300"
            }`}
          >
            Platform
          </button>
          <button
            onClick={() => selectTab("frontend")}
            className={`flex-1 px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
              submissionType === "frontend" ? "pill-active" : "bg-base-200 text-white hover:bg-base-300"
            }`}
          >
            Frontend
          </button>
        </div>

        {submissionType === "content" ? (
          <div className="surface-card rounded-2xl p-6 space-y-5">
            <h1 className="text-2xl font-semibold">Submit Content</h1>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Platform Selection - Searchable Dropdown */}
              <div ref={platformDropdownRef} className="relative">
                <label className="block text-base font-medium mb-2">Select Platform</label>
                {categoriesLoading ? (
                  <div className="input input-bordered w-full bg-base-100 flex items-center">
                    <span className="loading loading-spinner loading-sm"></span>
                  </div>
                ) : websiteCategories.length > 0 ? (
                  <>
                    {/* Selected Platform Display / Dropdown Trigger */}
                    <button
                      type="button"
                      onClick={() => setIsPlatformDropdownOpen(!isPlatformDropdownOpen)}
                      className="input input-bordered w-full bg-base-100 flex items-center justify-between cursor-pointer hover:bg-base-200 transition-colors"
                    >
                      {selectedCategory ? (
                        <div className="flex items-center gap-2">
                          <PlatformIcon domain={selectedCategory.domain} className="w-5 h-5" />
                          <span>{selectedCategory.name}</span>
                        </div>
                      ) : (
                        <span className="text-base-content/50">Select a platform...</span>
                      )}
                      <ChevronDownIcon
                        className={`w-5 h-5 text-base-content/50 transition-transform ${isPlatformDropdownOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {/* Dropdown Menu */}
                    {isPlatformDropdownOpen && (
                      <div className="absolute z-50 mt-1 w-full bg-base-100 border border-base-300 rounded-lg shadow-lg overflow-hidden">
                        {/* Search Input */}
                        <div className="p-2 border-b border-base-300">
                          <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-base-content/50" />
                            <input
                              type="text"
                              placeholder="Search platforms..."
                              className="input input-sm w-full pl-9 pr-8 bg-base-200"
                              value={platformSearch}
                              onChange={e => setPlatformSearch(e.target.value)}
                              autoFocus
                            />
                            {platformSearch && (
                              <button
                                type="button"
                                onClick={() => setPlatformSearch("")}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                              >
                                <XMarkIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Platform List */}
                        <div className="max-h-60 overflow-y-auto">
                          {filteredPlatforms.length > 0 ? (
                            filteredPlatforms.map(cat => {
                              const isSelected = selectedCategory?.id === cat.id;
                              return (
                                <button
                                  key={cat.id.toString()}
                                  type="button"
                                  onClick={() => {
                                    handleCategorySelect(cat);
                                    setIsPlatformDropdownOpen(false);
                                    setPlatformSearch("");
                                  }}
                                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                    isSelected ? "bg-primary/10 text-primary" : "hover:bg-base-200 text-base-content"
                                  }`}
                                >
                                  <PlatformIcon domain={cat.domain} className="w-5 h-5" />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{cat.name}</span>
                                    <span className="text-base text-base-content/50">{cat.domain}</span>
                                  </div>
                                  {isSelected && <span className="ml-auto text-primary">✓</span>}
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-4 py-3 text-base-content/50 text-base">
                              No platforms found for &quot;{platformSearch}&quot;
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-base text-base-content/50">No platforms available. Propose one!</p>
                )}
              </div>

              {/* URL Input - with dynamic placeholder */}
              <div>
                <label className="flex items-center gap-1.5 text-base font-medium mb-2">
                  URL
                  <InfoTooltip text={urlConfig.urlHint} />
                </label>
                <input
                  type="url"
                  placeholder={urlConfig.urlPlaceholder}
                  className={`input input-bordered w-full bg-base-100 ${urlError ? "input-error" : ""}`}
                  value={url}
                  onChange={handleUrlChange}
                  onBlur={() => validateUrl(url)}
                  required
                />
                {urlError && <p className="text-error text-base mt-1">{urlError}</p>}
                {!urlError && isUrlAlreadySubmitted && (
                  <p className="text-error text-base mt-1">This content has already been submitted</p>
                )}
                {urlCategoryMismatch && (
                  <p className="text-warning text-base mt-1">
                    Warning: The URL domain doesn&apos;t match the selected platform
                  </p>
                )}
              </div>

              {/* Goal Input */}
              <div>
                <label className="block text-base font-medium mb-2">Title / Description</label>
                <textarea
                  placeholder="Add a title and description to help others discover this content"
                  className={`textarea textarea-bordered w-full h-24 bg-base-100 ${goalError ? "textarea-error" : ""}`}
                  value={goal}
                  onChange={e => handleGoalChange(e.target.value)}
                  required
                  maxLength={500}
                />
                {goalError && <p className="text-error text-base mt-1">{goalError}</p>}
                <div className="text-right mt-1">
                  <span className="text-base text-base-content/30">{goal.length}/500</span>
                </div>
              </div>

              {/* Subcategory Selection - Only show when category is selected */}
              {selectedCategory && (
                <div>
                  <label className="block text-base font-medium mb-2">
                    Select Categories <span className="text-base-content/40 font-normal">(1-3)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedCategory.subcategories.map(subcat => {
                      const isSelected = selectedSubcategories.includes(subcat);
                      return (
                        <button
                          key={subcat}
                          type="button"
                          onClick={() => handleSubcategoryToggle(subcat)}
                          className={`px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
                            isSelected ? "pill-active" : "bg-base-200 text-white hover:bg-base-300"
                          }`}
                        >
                          {subcat}
                        </button>
                      );
                    })}
                    {/* Show custom subcategories */}
                    {selectedSubcategories
                      .filter(s => !selectedCategory.subcategories.includes(s))
                      .map(subcat => (
                        <button
                          key={subcat}
                          type="button"
                          onClick={() => handleSubcategoryToggle(subcat)}
                          className="px-3 py-1.5 rounded-full text-base font-medium transition-colors pill-active flex items-center gap-1"
                        >
                          {subcat}
                          <span className="opacity-70">×</span>
                        </button>
                      ))}
                  </div>
                  {/* Custom subcategory input */}
                  <div className="flex gap-2 mt-3">
                    <input
                      type="text"
                      placeholder="Add custom category..."
                      className="input input-bordered flex-1 bg-base-100 input-sm"
                      value={customSubcategory}
                      onChange={e => setCustomSubcategory(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomSubcategory();
                        }
                      }}
                      disabled={selectedSubcategories.length >= 3}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomSubcategory}
                      disabled={
                        !customSubcategory.trim() ||
                        selectedSubcategories.length >= 3 ||
                        selectedSubcategories.includes(customSubcategory.trim())
                      }
                      className="btn btn-outline btn-sm"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Preview */}
              {url && isValidUrl && (
                <div className="surface-card rounded-2xl p-4 space-y-3">
                  <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
                  <ContentEmbed url={url} compact />
                  {goal && <p className="text-base text-base-content/70">{goal}</p>}
                  {selectedSubcategories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {selectedSubcategories.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-primary/10 text-primary text-base font-medium rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Prohibited Content Warning */}
              <div className="bg-error/10 rounded-lg p-4">
                <p className="text-base font-medium text-error mb-2">Prohibited Content</p>
                <p className="text-base text-base-content/70">
                  Do not submit illegal or harmful content. This includes but is not limited to: child exploitation
                  material, non-consensual intimate imagery, content promoting violence or terrorism, doxxing, or
                  copyright-infringing material. Violations will result in stake slashing and potential legal action.
                </p>
              </div>

              {/* Stake info */}
              <div
                className="rounded-2xl p-4"
                style={{
                  background: "#112840",
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 text-base font-medium text-white">
                      Submission Stake
                      <InfoTooltip text="Returned after ~4 days if rating stays above 10%. Receive 10% of the losing stakes every round" />
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold text-white">10 cREP</span>
                  </div>
                </div>
                {submissionBonus !== undefined && (
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/10">
                    <p className="flex items-center gap-1.5 text-sm text-white/60">
                      Participation Bonus
                      <InfoTooltip text="Immediate cREP reward from the Participation Pool. Rate decreases as more cREP is distributed." />
                    </p>
                    <span className="text-sm font-semibold text-emerald-400">
                      +{submissionBonus} cREP ({ratePercent}%)
                    </span>
                  </div>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                className="btn btn-submit w-full"
                disabled={
                  !isValidUrl ||
                  !goal ||
                  !!goalError ||
                  !selectedCategory ||
                  selectedSubcategories.length === 0 ||
                  isSubmitting ||
                  isUrlAlreadySubmitted ||
                  urlCategoryMismatch
                }
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-sm"></span>
                    Submitting...
                  </span>
                ) : (
                  "Submit Content"
                )}
              </button>
            </form>
          </div>
        ) : submissionType === "category" ? (
          <CategorySubmissionForm />
        ) : (
          <FrontendRegistration />
        )}
      </div>

      {/* Share Modal */}
      {submittedContent && (
        <ShareModal contentId={submittedContent.id} goal={submittedContent.goal} onClose={handleCloseShareModal} />
      )}
    </div>
  );
};

// Wrap in Suspense for useSearchParams
const SubmitPageWrapper: NextPage = () => {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center items-center min-h-[60vh]">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      <SubmitPage />
    </Suspense>
  );
};

export default SubmitPageWrapper;
