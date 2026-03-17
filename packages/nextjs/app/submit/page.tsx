"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ContentRegistryAbi } from "@curyo/contracts/abis";
import type { NextPage } from "next";
import { useAccount, useReadContract } from "wagmi";
import { ChevronDownIcon, IdentificationIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { CategorySubmissionForm } from "~~/components/governance/CategorySubmissionForm";
import { FrontendRegistration } from "~~/components/governance/FrontendRegistration";
import { RainbowKitCustomConnectButton } from "~~/components/scaffold-eth";
import { AppPageShell } from "~~/components/shared/AppPageShell";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { serializeTags } from "~~/constants/categories";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import {
  Category,
  extractDomain,
  getCategoryIdFromUrl,
  resolveCanonicalDomain,
  useCategoryRegistry,
} from "~~/hooks/useCategoryRegistry";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";
import { containsBlockedText, containsBlockedUrl } from "~~/utils/contentFilter";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";
import { canonicalizeUrl, isSupportedVideoPlatform } from "~~/utils/platforms";
import { notification } from "~~/utils/scaffold-eth";

const ShareModal = dynamic(() => import("~~/components/submit/ShareModal").then(m => m.ShareModal), { ssr: false });

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
  "open.spotify.com": {
    urlPlaceholder: "https://open.spotify.com/show/5eXZwvvxt3K2dxha3BSaAe",
    urlHint: "Paste a Spotify podcast show or episode URL",
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

const MAX_TITLE_LENGTH = 96;

function getTitleValidationError(value: string): string | null {
  if (value.length > MAX_TITLE_LENGTH) {
    return `Title must be ${MAX_TITLE_LENGTH} characters or fewer`;
  }

  const check = containsBlockedText(value);
  return check.blocked ? "Your title contains prohibited content" : null;
}

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
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [customSubcategory, setCustomSubcategory] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedContent, setSubmittedContent] = useState<{
    id: bigint;
    title: string;
    description: string;
  } | null>(null);

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

    const sanitizedUrl = sanitizeExternalUrl(value);
    if (!sanitizedUrl) {
      setUrlError("Please enter a valid HTTPS URL");
      return;
    }

    // Check for prohibited content in URL
    const urlCheck = containsBlockedUrl(sanitizedUrl);
    if (urlCheck.blocked) {
      setUrlError("This URL contains prohibited content and cannot be submitted");
      return;
    }

    // Check against approved platforms from CategoryRegistry
    if (domainToCategoryId.size > 0) {
      // Use dynamic category validation
      const categoryId = getCategoryIdFromUrl(sanitizedUrl, domainToCategoryId);
      if (categoryId === 0n) {
        const platformNames = websiteCategories.map(c => c.name).join(", ");
        setUrlError(`Please enter a URL from an approved platform (${platformNames})`);
      } else {
        setUrlError(null);
      }
      return;
    }

    // Fallback to static validation if categories not loaded
    if (!isSupportedVideoPlatform(sanitizedUrl)) {
      setUrlError("Please enter a URL from YouTube or Twitch");
      return;
    }

    setUrlError(null);
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
  const canonicalUrl = useMemo(() => {
    if (!url || urlError) return undefined;
    return canonicalizeUrl(url);
  }, [url, urlError]);
  const { data: isUrlSubmitted } = useReadContract({
    address: registryInfo?.address,
    abi: ContentRegistryAbi,
    functionName: "isUrlSubmitted",
    args: canonicalUrl ? [canonicalUrl] : undefined,
    query: {
      enabled: Boolean(registryInfo?.address && canonicalUrl),
      staleTime: 30_000,
    },
  });
  const isUrlAlreadySubmitted = Boolean(canonicalUrl && isUrlSubmitted);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setTitleError(getTitleValidationError(value));
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    const check = containsBlockedText(value);
    setDescriptionError(check.blocked ? "Your description contains prohibited content" : null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address || !registryInfo?.address || !isValidUrl || !selectedCategory) return;

    if (urlCategoryMismatch) {
      notification.error("URL doesn't match the selected platform");
      return;
    }

    const nextTitleError = getTitleValidationError(title);
    if (nextTitleError) {
      setTitleError(nextTitleError);
      notification.warning(nextTitleError);
      return;
    }

    if (containsBlockedText(title).blocked || containsBlockedText(description).blocked) {
      notification.warning("Your title or description contains prohibited content and cannot be submitted");
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
    const submittedTitle = title;
    const submittedDescription = description;
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

      // Re-check wallet before second tx
      if (!address) {
        notification.error("Wallet disconnected after approval. Please reconnect and retry.");
        return;
      }

      await writeRegistry({
        functionName: "submitContent",
        args: [canonicalUrl, title, description, serializeTags(selectedSubcategories), selectedCategory.id],
      });

      // Refetch to update the nextContentId for future submissions
      await refetchNextContentId();

      notification.success("Content submitted! Staked 10 cREP.");

      // Show share modal
      setSubmittedContent({ id: contentId, title: submittedTitle, description: submittedDescription });

      // Clear form
      setUrl("");
      setUrlError(null);
      setTitle("");
      setTitleError(null);
      setDescription("");
      setDescriptionError(null);
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
          <h1 className={`${surfaceSectionHeadingClassName} mb-3`}>Submit</h1>
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
          <h1 className={surfaceSectionHeadingClassName}>Voter ID Required</h1>
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
    <AppPageShell>
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => selectTab("content")}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            submissionType === "content" ? "pill-active" : "pill-inactive"
          }`}
        >
          Content
        </button>
        <button
          onClick={() => selectTab("category")}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            submissionType === "category" ? "pill-active" : "pill-inactive"
          }`}
        >
          Platform
        </button>
        <button
          onClick={() => selectTab("frontend")}
          className={`px-4 py-1.5 rounded-full text-base font-medium transition-colors ${
            submissionType === "frontend" ? "pill-active" : "pill-inactive"
          }`}
        >
          Frontend
        </button>
      </div>

      {submissionType === "content" ? (
        <div className="surface-card rounded-2xl p-6 space-y-5">
          <h1 className={surfaceSectionHeadingClassName}>Submit Content</h1>

          <form
            onSubmit={handleSubmit}
            className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] xl:items-start"
          >
            <div className="space-y-5">
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

              {/* Title Input */}
              <div>
                <label className="block text-base font-medium mb-2">Title</label>
                <input
                  type="text"
                  placeholder="Add a short title for this content"
                  className={`input input-bordered w-full bg-base-100 ${titleError ? "input-error" : ""}`}
                  value={title}
                  onChange={e => handleTitleChange(e.target.value)}
                  required
                  maxLength={MAX_TITLE_LENGTH}
                />
                {titleError && <p className="text-error text-base mt-1">{titleError}</p>}
                <div className="text-right mt-1">
                  <span className="text-base text-base-content/30">
                    {title.length}/{MAX_TITLE_LENGTH}
                  </span>
                </div>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-base font-medium mb-2">Description</label>
                <textarea
                  placeholder="Add a description to help others discover this content"
                  className={`textarea textarea-bordered w-full h-24 bg-base-100 ${descriptionError ? "textarea-error" : ""}`}
                  value={description}
                  onChange={e => handleDescriptionChange(e.target.value)}
                  required
                  maxLength={500}
                />
                {descriptionError && <p className="text-error text-base mt-1">{descriptionError}</p>}
                <div className="text-right mt-1">
                  <span className="text-base text-base-content/30">{description.length}/500</span>
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
                            isSelected ? "pill-active" : "pill-inactive"
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
            </div>

            <div className="space-y-4 xl:sticky xl:top-24">
              {url && isValidUrl ? (
                <div className="surface-card rounded-2xl p-4 space-y-3">
                  <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
                  {title ? <h3 className="text-lg font-semibold text-base-content line-clamp-2">{title}</h3> : null}
                  <ContentEmbed url={url} compact />
                  {description ? <p className="text-base text-base-content/70">{description}</p> : null}
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
              ) : (
                <div className="surface-card rounded-2xl p-4 space-y-3">
                  <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
                  <p className="text-base text-base-content/50">
                    Pick a platform and paste a supported URL to preview how your submission will appear.
                  </p>
                </div>
              )}

              <div className="bg-error/10 rounded-lg p-4">
                <p className="text-base font-medium text-error mb-2">Prohibited Content</p>
                <p className="text-base text-base-content/70">
                  Do not submit illegal or harmful content. This includes but is not limited to: child exploitation
                  material, non-consensual intimate imagery, content promoting violence or terrorism, doxxing, or
                  copyright-infringing material. Violations will result in stake slashing and potential legal action.
                </p>
              </div>

              {/* Stake info */}
              <div className="surface-card-nested rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="flex items-center gap-1.5 text-base font-medium text-base-content">
                      Submission Stake
                      <InfoTooltip
                        text={`Returned after ~4 days once a settled round confirms rating stays above 25. If no round ever settles, the stake unlocks when the content reaches dormancy instead. Settled two-sided rounds allocate ${protocolDocFacts.submitterShareLabel} to the submitter.`}
                      />
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-bold text-base-content">10 cREP</span>
                  </div>
                </div>
                {submissionBonus !== undefined && (
                  <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                    <p className="flex items-center gap-1.5 text-sm text-base-content/60">
                      Participation Bonus
                      <InfoTooltip text="Projected cREP reward from the Participation Pool, paid only when the submitter stake resolves on the healthy path after a settled round. Rate decreases as more cREP is distributed." />
                    </p>
                    <span className="text-sm font-semibold text-success">
                      +{submissionBonus} cREP ({ratePercent}%)
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-submit w-full"
                disabled={
                  !isValidUrl ||
                  !title ||
                  !!titleError ||
                  !description ||
                  !!descriptionError ||
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
            </div>
          </form>
        </div>
      ) : submissionType === "category" ? (
        <CategorySubmissionForm />
      ) : (
        <FrontendRegistration />
      )}

      {/* Share Modal */}
      {submittedContent && (
        <ShareModal
          contentId={submittedContent.id}
          title={submittedContent.title}
          description={submittedContent.description}
          onClose={handleCloseShareModal}
        />
      )}
    </AppPageShell>
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
