"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  buildSubmissionReservationStorageKey,
  buildSubmissionRevealCommitment,
  clearStoredSubmissionReservation,
  createStoredSubmissionReservation,
  deriveSubmissionReservationSalt,
  getStoredSubmissionReservation,
  setStoredSubmissionReservation,
  submissionReservationMatchesDraft,
} from "./submissionReservation";
import { decodeEventLog } from "viem";
import { useAccount, useConfig } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { GasBalanceWarning } from "~~/components/shared/GasBalanceWarning";
import { TransactionStatusCallout } from "~~/components/shared/TransactionStatusCallout";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { serializeTags } from "~~/constants/categories";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import {
  type Category,
  extractDomain,
  getCategoryIdFromUrl,
  resolveCanonicalDomain,
  useCategoryRegistry,
} from "~~/hooks/useCategoryRegistry";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import { MAX_CONTENT_DESCRIPTION_LENGTH } from "~~/lib/contentDescription";
import { MAX_CONTENT_TITLE_LENGTH } from "~~/lib/contentTitle";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";
import {
  findBlockedContentTags,
  getContentDescriptionValidationError,
  getContentTagValidationError,
  getContentTitleValidationError,
} from "~~/lib/moderation/submissionValidation";
import {
  getGasBalanceErrorMessage,
  isFreeTransactionExhaustedError,
  isInsufficientFundsError,
  isWalletRpcOverloadedError,
} from "~~/lib/transactionErrors";
import { getSubmittingTransactionStatus } from "~~/lib/ui/transactionStatusCopy";
import { containsBlockedUrl } from "~~/utils/contentFilter";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";
import { canonicalizeUrl, isSupportedVideoPlatform } from "~~/utils/platforms";
import { notification } from "~~/utils/scaffold-eth";

const ShareModal = dynamic(() => import("~~/components/submit/ShareModal").then(m => m.ShareModal), { ssr: false });

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
  "themoviedb.org": {
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

function isReservationExistsError(error: unknown): boolean {
  const message =
    (error as { shortMessage?: string; message?: string } | undefined)?.shortMessage ??
    (error as { shortMessage?: string; message?: string } | undefined)?.message ??
    "";
  return message.includes("Reservation exists");
}

function isReservationNotFoundError(error: unknown): boolean {
  const message =
    (error as { shortMessage?: string; message?: string } | undefined)?.shortMessage ??
    (error as { shortMessage?: string; message?: string } | undefined)?.message ??
    "";
  return message.includes("Reservation not found");
}

function PlatformIcon({ domain, className }: { domain: string; className?: string }) {
  const iconClass = className || "w-4 h-4";
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

export function ContentSubmissionSection() {
  const wagmiConfig = useConfig();
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { canSponsorTransactions, isMissingGasBalance, nativeTokenSymbol } = useGasBalanceStatus({
    includeExternalSendCalls: true,
  });
  const { ratePercent, calculateBonus } = useParticipationRate();
  const { canUseSponsoredSubmitCalls, executeSponsoredCalls, isAwaitingSponsoredSubmitCalls } =
    useThirdwebSponsoredSubmitCalls();
  const { showWalletRpcOverloadNotification } = useWalletRpcRecovery();
  const submissionBonus = calculateBonus(10);
  const { requireAcceptance } = useTermsAcceptance();

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
  const submittingStatus = getSubmittingTransactionStatus("content");
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submittedContent, setSubmittedContent] = useState<{
    id: bigint;
    title: string;
    description: string;
  } | null>(null);
  const [platformSearch, setPlatformSearch] = useState("");
  const [isPlatformDropdownOpen, setIsPlatformDropdownOpen] = useState(false);
  const platformDropdownRef = useRef<HTMLDivElement>(null);

  const { categories: websiteCategories, domainToCategoryId, isLoading: categoriesLoading } = useCategoryRegistry();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (platformDropdownRef.current && !platformDropdownRef.current.contains(event.target as Node)) {
        setIsPlatformDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredPlatforms = useMemo(() => {
    if (!platformSearch.trim()) return websiteCategories;
    const search = platformSearch.toLowerCase();
    return websiteCategories.filter(
      cat => cat.name.toLowerCase().includes(search) || cat.domain.toLowerCase().includes(search),
    );
  }, [websiteCategories, platformSearch]);

  const detectedCategoryId = useMemo(() => {
    if (!url || urlError) return 0n;
    return getCategoryIdFromUrl(url, domainToCategoryId);
  }, [url, urlError, domainToCategoryId]);

  const detectedCategory = useMemo(() => {
    if (detectedCategoryId === 0n) return null;
    return websiteCategories.find(cat => cat.id === detectedCategoryId);
  }, [detectedCategoryId, websiteCategories]);

  useEffect(() => {
    if (detectedCategory && (!selectedCategory || selectedCategory.id !== detectedCategory.id)) {
      setSelectedCategory(detectedCategory);
      setSelectedSubcategories([]);
    }
  }, [detectedCategory, selectedCategory]);

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

  const urlConfig = useMemo(() => {
    if (!selectedCategory) return DEFAULT_URL_CONFIG;
    return (
      PLATFORM_CONFIG[selectedCategory.domain] ??
      PLATFORM_CONFIG[resolveCanonicalDomain(selectedCategory.domain)] ??
      DEFAULT_URL_CONFIG
    );
  }, [selectedCategory]);
  const customSubcategoryError = customSubcategory ? getContentTagValidationError(customSubcategory) : null;

  const getUrlValidationError = (value: string): string | null => {
    if (!value) {
      return null;
    }

    const sanitizedUrl = sanitizeExternalUrl(value);
    if (!sanitizedUrl) {
      return "Please enter a valid HTTPS URL";
    }

    const urlCheck = containsBlockedUrl(sanitizedUrl);
    if (urlCheck.blocked) {
      return "This URL contains prohibited content and cannot be submitted";
    }

    if (domainToCategoryId.size > 0) {
      const categoryId = getCategoryIdFromUrl(sanitizedUrl, domainToCategoryId);
      if (categoryId === 0n) {
        const platformNames = websiteCategories.map(c => c.name).join(", ");
        return `Please enter a URL from an approved platform (${platformNames})`;
      }
      return null;
    }

    if (!isSupportedVideoPlatform(sanitizedUrl)) {
      return "Please enter a URL from YouTube or Twitch";
    }

    return null;
  };

  const validateUrl = (value: string) => {
    setUrlError(getUrlValidationError(value));
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
    if (url) {
      try {
        const urlDomain = extractDomain(url);
        if (urlDomain && resolveCanonicalDomain(urlDomain) !== resolveCanonicalDomain(category.domain)) {
          setUrl("");
          setUrlError(null);
        }
      } catch {
        // Keep URL if extraction fails.
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
    if (
      trimmed &&
      !selectedSubcategories.includes(trimmed) &&
      selectedSubcategories.length < 3 &&
      getContentTagValidationError(trimmed) === null
    ) {
      setSelectedSubcategories(prev => [...prev, trimmed]);
      setCustomSubcategory("");
    }
  };

  const { writeContractAsync: writeCRep } = useScaffoldWriteContract({ contractName: "CuryoReputation" });
  const { writeContractAsync: writeRegistry } = useScaffoldWriteContract({
    contractName: "ContentRegistry",
    disableSimulate: true,
  });
  const { data: registryInfo, isLoading: isRegistryLoading } = useDeployedContractInfo({
    contractName: "ContentRegistry",
  });
  const { data: crepInfo, isLoading: isCrepLoading } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const registryAddress = registryInfo?.address as `0x${string}` | undefined;
  const crepAddress = crepInfo?.address as `0x${string}` | undefined;
  const { refetch: refetchNextContentId } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "nextContentId",
  });
  const canonicalUrl = useMemo(() => {
    if (!url || urlError) return undefined;
    return canonicalizeUrl(url);
  }, [url, urlError]);
  const { data: isUrlSubmitted } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "isUrlSubmitted",
    args: [canonicalUrl as string],
    query: {
      enabled: Boolean(canonicalUrl),
      staleTime: 30_000,
    },
  });
  const isUrlAlreadySubmitted = Boolean(canonicalUrl && isUrlSubmitted);

  const extractSubmittedContentId = (logs: { address: string; data: `0x${string}`; topics: `0x${string}`[] }[]) => {
    if (!registryInfo) {
      return null;
    }

    const submittedLog = logs.find(log => {
      if (log.address.toLowerCase() !== registryInfo.address.toLowerCase()) {
        return false;
      }

      try {
        const decoded = decodeEventLog({
          abi: registryInfo.abi,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        return decoded.eventName === "ContentSubmitted";
      } catch {
        return false;
      }
    });

    return submittedLog?.topics[1] ? BigInt(submittedLog.topics[1]) : null;
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    setTitleError(getContentTitleValidationError(value));
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    setDescriptionError(getContentDescriptionValidationError(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegistryLoading || isCrepLoading) {
      notification.warning("Submission is still loading. Try again in a moment.");
      return;
    }

    if (!registryInfo || !registryAddress || !crepInfo || !crepAddress) {
      notification.error("Submission is unavailable right now.");
      return;
    }

    setSubmitAttempted(true);

    if (isAwaitingSponsoredSubmitCalls) {
      notification.warning("Wallet reconnecting. Retry in a moment.");
      return;
    }

    if (isMissingGasBalance) {
      notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
      return;
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const nextUrlError = getUrlValidationError(url);
    const nextTitleError = trimmedTitle ? getContentTitleValidationError(trimmedTitle) : null;
    const nextDescriptionError = trimmedDescription ? getContentDescriptionValidationError(trimmedDescription) : null;
    const blockedContentTags = findBlockedContentTags(selectedSubcategories);

    setUrlError(nextUrlError);
    setTitleError(nextTitleError);
    setDescriptionError(nextDescriptionError);

    if (!selectedCategory || !url || !trimmedTitle || !trimmedDescription || selectedSubcategories.length === 0) {
      notification.warning("Fill in the highlighted fields before submitting.");
      return;
    }

    if (blockedContentTags.length > 0) {
      notification.warning("Remove categories with prohibited content before submitting.");
      return;
    }

    const normalizedSubmissionUrl = canonicalUrl;
    if (!normalizedSubmissionUrl) {
      notification.warning("Please fix the highlighted fields before submitting.");
      return;
    }

    if (nextUrlError || nextTitleError || nextDescriptionError) {
      notification.warning("Please fix the highlighted fields before submitting.");
      return;
    }

    if (isUrlAlreadySubmitted) {
      notification.warning("This content has already been submitted.");
      return;
    }

    if (urlCategoryMismatch) {
      notification.error("URL doesn't match the selected platform");
      return;
    }

    const accepted = await requireAcceptance("submit");
    if (!accepted) return;

    setIsSubmitting(true);
    const submittedTitle = title;
    const submittedDescription = description;
    let reservationStorageKey: string | null = null;
    try {
      let contentId: bigint | null = null;
      const stakeAmount = BigInt(10 * 1e6);
      const submissionTags = serializeTags(selectedSubcategories);
      const submitterAddress = connectedAddress as `0x${string}` | undefined;
      if (!submitterAddress) {
        throw new Error("Wallet not connected");
      }

      const [, submissionKey] = (await readContract(wagmiConfig, {
        abi: registryInfo.abi,
        address: registryAddress,
        functionName: "previewSubmissionKey",
        args: [normalizedSubmissionUrl, selectedCategory.id],
      })) as readonly [bigint, `0x${string}`];
      const submissionDraft = {
        categoryId: selectedCategory.id,
        description: submittedDescription,
        submissionKey,
        tags: submissionTags,
        title: submittedTitle,
        url: normalizedSubmissionUrl,
      };
      reservationStorageKey = buildSubmissionReservationStorageKey(submitterAddress, targetNetwork.id, submissionKey);

      const cancelReservedSubmission = async (revealCommitment: `0x${string}`) => {
        if (canUseSponsoredSubmitCalls) {
          await executeSponsoredCalls(
            [
              {
                abi: registryInfo.abi,
                address: registryAddress,
                args: [revealCommitment],
                functionName: "cancelReservedSubmission",
              },
            ],
            {
              atomicRequired: true,
            },
          );
          return;
        }

        const cancelTxHash = await writeRegistry({
          functionName: "cancelReservedSubmission",
          args: [revealCommitment],
        });

        if (cancelTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: cancelTxHash });
        }
      };

      const reserveSubmission = async (revealCommitment: `0x${string}`) => {
        if (canUseSponsoredSubmitCalls) {
          await executeSponsoredCalls(
            [
              {
                abi: crepInfo.abi,
                address: crepAddress,
                args: [registryAddress, stakeAmount],
                functionName: "approve",
              },
              {
                abi: registryInfo.abi,
                address: registryAddress,
                args: [revealCommitment],
                functionName: "reserveSubmission",
              },
            ],
            {
              atomicRequired: true,
            },
          );
          return;
        }

        const approveTxHash = await writeCRep(
          { functionName: "approve", args: [registryAddress, stakeAmount] },
          { blockConfirmations: 1 },
        );

        if (approveTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: approveTxHash });
        }

        const reserveTxHash = await writeRegistry({
          functionName: "reserveSubmission",
          args: [revealCommitment],
        });

        if (reserveTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: reserveTxHash });
        }
      };

      let activeReservation = getStoredSubmissionReservation(reservationStorageKey);

      if (activeReservation && !submissionReservationMatchesDraft(activeReservation, submissionDraft)) {
        try {
          await cancelReservedSubmission(activeReservation.revealCommitment);
        } catch (error) {
          if (!isReservationNotFoundError(error)) {
            throw error;
          }
        }

        clearStoredSubmissionReservation(reservationStorageKey);
        activeReservation = null;
      }

      if (!activeReservation) {
        const submissionSalt = deriveSubmissionReservationSalt(submissionDraft, submitterAddress, targetNetwork.id);
        const revealCommitment = buildSubmissionRevealCommitment(submissionDraft, submissionSalt, submitterAddress);

        try {
          await reserveSubmission(revealCommitment);
        } catch (error) {
          if (!isReservationExistsError(error)) {
            throw error;
          }
        }

        activeReservation = createStoredSubmissionReservation(
          submissionDraft,
          submissionSalt,
          revealCommitment,
          targetNetwork.id,
        );
        setStoredSubmissionReservation(reservationStorageKey, activeReservation);
      }

      // ContentRegistry enforces a minimum reservation age before reveal.
      // Give the next block timestamp enough room to advance before submitContent.
      await new Promise(resolve => setTimeout(resolve, 1_100));

      if (canUseSponsoredSubmitCalls) {
        const callsResult = await executeSponsoredCalls(
          [
            {
              abi: registryInfo.abi,
              address: registryAddress,
              args: [
                normalizedSubmissionUrl,
                submittedTitle,
                submittedDescription,
                submissionTags,
                selectedCategory.id,
                activeReservation.salt,
              ],
              functionName: "submitContent",
            },
          ],
          {
            atomicRequired: true,
          },
        );

        contentId = extractSubmittedContentId((callsResult.receipts ?? []).flatMap(receipt => receipt.logs));
      } else {
        const submitTxHash = await writeRegistry({
          functionName: "submitContent",
          args: [
            normalizedSubmissionUrl,
            submittedTitle,
            submittedDescription,
            submissionTags,
            selectedCategory.id,
            activeReservation.salt,
          ],
        });

        if (submitTxHash) {
          const submitReceipt = await waitForTransactionReceipt(wagmiConfig, { hash: submitTxHash });
          contentId = extractSubmittedContentId(submitReceipt.logs);
        }
      }

      await refetchNextContentId();
      clearStoredSubmissionReservation(reservationStorageKey);

      notification.success("Content submitted! Staked 10 cREP.");
      setSubmittedContent(
        contentId !== null ? { id: contentId, title: submittedTitle, description: submittedDescription } : null,
      );
      setUrl("");
      setUrlError(null);
      setTitle("");
      setTitleError(null);
      setDescription("");
      setDescriptionError(null);
      setSelectedCategory(null);
      setSelectedSubcategories([]);
      setCustomSubcategory("");
      setSubmitAttempted(false);
    } catch (e: unknown) {
      console.error("Submit failed:", e);
      if (isFreeTransactionExhaustedError(e) || isInsufficientFundsError(e)) {
        notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
      } else if (isWalletRpcOverloadedError(e)) {
        showWalletRpcOverloadNotification();
      } else if (isReservationNotFoundError(e)) {
        if (reservationStorageKey) {
          clearStoredSubmissionReservation(reservationStorageKey);
        }
        notification.warning("Reservation expired. Retry submit.");
      } else if (isReservationExistsError(e)) {
        notification.warning("Reservation saved. Retry submit.");
      } else {
        notification.error(
          (e as { shortMessage?: string; message?: string } | undefined)?.shortMessage ||
            (e as { shortMessage?: string; message?: string } | undefined)?.message ||
            "Failed to submit content",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseShareModal = () => {
    setSubmittedContent(null);
  };

  return (
    <>
      <div className="surface-card rounded-2xl p-6 space-y-5">
        <h1 className={surfaceSectionHeadingClassName}>Submit Content</h1>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] xl:items-start"
        >
          <div className="space-y-5">
            <div ref={platformDropdownRef} className="relative">
              <label
                className={`mb-2 block text-base font-medium ${submitAttempted && !selectedCategory ? "text-error" : ""}`}
              >
                Select Platform
              </label>
              {categoriesLoading ? (
                <div className="input input-bordered flex w-full items-center bg-base-100">
                  <span className="loading loading-spinner loading-sm"></span>
                </div>
              ) : websiteCategories.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsPlatformDropdownOpen(!isPlatformDropdownOpen)}
                    className={`input input-bordered flex w-full cursor-pointer items-center justify-between bg-base-100 transition-colors hover:bg-base-200 ${
                      submitAttempted && !selectedCategory ? "input-error" : ""
                    }`}
                  >
                    {selectedCategory ? (
                      <div className="flex items-center gap-2">
                        <PlatformIcon domain={selectedCategory.domain} className="h-5 w-5" />
                        <span>{selectedCategory.name}</span>
                      </div>
                    ) : (
                      <span className="text-base-content/50">Select a platform...</span>
                    )}
                    <ChevronDownIcon
                      className={`h-5 w-5 text-base-content/50 transition-transform ${isPlatformDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {submitAttempted && !selectedCategory ? (
                    <p className="mt-1 text-base text-error">Select a platform before submitting.</p>
                  ) : null}

                  {isPlatformDropdownOpen ? (
                    <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg">
                      <div className="border-b border-base-300 p-2">
                        <div className="relative">
                          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/50" />
                          <input
                            type="text"
                            placeholder="Search platforms..."
                            className="input input-sm w-full bg-base-200 pl-9 pr-8"
                            value={platformSearch}
                            onChange={e => setPlatformSearch(e.target.value)}
                            autoFocus
                          />
                          {platformSearch ? (
                            <button
                              type="button"
                              onClick={() => setPlatformSearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>

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
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                  isSelected ? "bg-primary/10 text-primary" : "text-base-content hover:bg-base-200"
                                }`}
                              >
                                <PlatformIcon domain={cat.domain} className="h-5 w-5" />
                                <div className="flex flex-col">
                                  <span className="font-medium">{cat.name}</span>
                                  <span className="text-base text-base-content/50">{cat.domain}</span>
                                </div>
                                {isSelected ? <span className="ml-auto text-primary">✓</span> : null}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-4 py-3 text-base text-base-content/50">
                            No platforms found for &quot;{platformSearch}&quot;
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-base text-base-content/50">No platforms available. Propose one!</p>
              )}
            </div>

            <div>
              <label
                className={`mb-2 flex items-center gap-1.5 text-base font-medium ${submitAttempted && !url ? "text-error" : ""}`}
              >
                URL
                <InfoTooltip text={urlConfig.urlHint} />
              </label>
              <input
                type="url"
                placeholder={urlConfig.urlPlaceholder}
                className={`input input-bordered w-full bg-base-100 ${urlError || (submitAttempted && !url) ? "input-error" : ""}`}
                value={url}
                onChange={handleUrlChange}
                onBlur={() => validateUrl(url)}
              />
              {submitAttempted && !url ? <p className="mt-1 text-base text-error">URL is required.</p> : null}
              {urlError ? <p className="mt-1 text-base text-error">{urlError}</p> : null}
              {!urlError && isUrlAlreadySubmitted ? (
                <p className="mt-1 text-base text-error">This content has already been submitted</p>
              ) : null}
              {urlCategoryMismatch ? (
                <p className="mt-1 text-base text-warning">
                  Warning: The URL domain doesn&apos;t match the selected platform
                </p>
              ) : null}
            </div>

            <div>
              <label
                className={`mb-2 block text-base font-medium ${submitAttempted && !title.trim() ? "text-error" : ""}`}
              >
                Title
              </label>
              <input
                type="text"
                placeholder="Add a short title for this content"
                className={`input input-bordered w-full bg-base-100 ${
                  titleError || (submitAttempted && !title.trim()) ? "input-error" : ""
                }`}
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                maxLength={MAX_CONTENT_TITLE_LENGTH}
              />
              {submitAttempted && !title.trim() ? (
                <p className="mt-1 text-base text-error">Title is required.</p>
              ) : null}
              {titleError ? <p className="mt-1 text-base text-error">{titleError}</p> : null}
              <div className="mt-1 text-right">
                <span className="text-base text-base-content/30">
                  {title.length}/{MAX_CONTENT_TITLE_LENGTH}
                </span>
              </div>
            </div>

            <div>
              <label
                className={`mb-2 block text-base font-medium ${submitAttempted && !description.trim() ? "text-error" : ""}`}
              >
                Description
              </label>
              <textarea
                placeholder="Add a description to help others discover this content"
                className={`textarea textarea-bordered h-24 w-full bg-base-100 ${
                  descriptionError || (submitAttempted && !description.trim()) ? "textarea-error" : ""
                }`}
                value={description}
                onChange={e => handleDescriptionChange(e.target.value)}
                maxLength={MAX_CONTENT_DESCRIPTION_LENGTH}
              />
              {submitAttempted && !description.trim() ? (
                <p className="mt-1 text-base text-error">Description is required.</p>
              ) : null}
              {descriptionError ? <p className="mt-1 text-base text-error">{descriptionError}</p> : null}
              <div className="mt-1 text-right">
                <span className="text-base text-base-content/30">
                  {description.length}/{MAX_CONTENT_DESCRIPTION_LENGTH}
                </span>
              </div>
            </div>

            {selectedCategory ? (
              <div>
                <label
                  className={`mb-2 block text-base font-medium ${
                    submitAttempted && selectedSubcategories.length === 0 ? "text-error" : ""
                  }`}
                >
                  Select Categories <span className="font-normal text-base-content/40">(1-3)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {selectedCategory.subcategories.map(subcat => {
                    const isSelected = selectedSubcategories.includes(subcat);
                    return (
                      <button
                        key={subcat}
                        type="button"
                        onClick={() => handleSubcategoryToggle(subcat)}
                        className={`rounded-full px-3 py-1.5 text-base font-medium transition-colors ${
                          isSelected ? "pill-active" : "pill-inactive"
                        }`}
                      >
                        {subcat}
                      </button>
                    );
                  })}
                  {selectedSubcategories
                    .filter(s => !selectedCategory.subcategories.includes(s))
                    .map(subcat => (
                      <button
                        key={subcat}
                        type="button"
                        onClick={() => handleSubcategoryToggle(subcat)}
                        className="pill-active flex items-center gap-1 rounded-full px-3 py-1.5 text-base font-medium transition-colors"
                      >
                        {subcat}
                        <span className="opacity-70">×</span>
                      </button>
                    ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add custom category..."
                    className={`input input-bordered input-sm flex-1 bg-base-100 ${customSubcategoryError ? "input-error" : ""}`}
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
                      customSubcategoryError !== null ||
                      selectedSubcategories.length >= 3 ||
                      selectedSubcategories.includes(customSubcategory.trim())
                    }
                    className="btn btn-outline btn-sm"
                  >
                    Add
                  </button>
                </div>
                {customSubcategoryError ? <p className="mt-2 text-base text-error">{customSubcategoryError}</p> : null}
                {submitAttempted && selectedSubcategories.length === 0 ? (
                  <p className="mt-2 text-base text-error">Pick at least one category before submitting.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-4 xl:sticky xl:top-24">
            {url && isValidUrl ? (
              <div className="surface-card rounded-2xl p-4 space-y-3">
                <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
                {title ? <h3 className="line-clamp-2 text-lg font-semibold text-base-content">{title}</h3> : null}
                <ContentEmbed url={url} compact />
                {description ? <p className="text-base text-base-content/70">{description}</p> : null}
                {selectedSubcategories.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedSubcategories.map(tag => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 px-2 py-0.5 text-base font-medium text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="surface-card rounded-2xl p-4 space-y-3">
                <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
                <p className="text-base text-base-content/50">
                  Pick a platform and paste a supported URL to preview how your submission will appear.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-error/10 p-4">
              <p className="mb-2 text-base font-medium text-error">Prohibited Content</p>
              <p className="text-base text-base-content/70">
                Do not submit illegal or harmful content. This includes but is not limited to: child exploitation
                material, non-consensual intimate imagery, content promoting violence or terrorism, doxxing, or
                copyright-infringing material. Violations will result in stake slashing and potential legal action.
              </p>
            </div>

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
              {submissionBonus !== undefined ? (
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                  <p className="flex items-center gap-1.5 text-sm text-base-content/60">
                    Participation Bonus
                    <InfoTooltip text="Projected cREP reward from the Participation Pool, paid only when the submitter stake resolves on the healthy path after a settled round. Rate decreases as more cREP is distributed." />
                  </p>
                  <span className="text-sm font-semibold text-success">
                    +{submissionBonus} cREP ({ratePercent}%)
                  </span>
                </div>
              ) : null}
            </div>

            {isMissingGasBalance ? <GasBalanceWarning nativeTokenSymbol={nativeTokenSymbol} /> : null}

            <button
              type="submit"
              className="btn btn-submit w-full"
              disabled={
                isSubmitting ||
                isAwaitingSponsoredSubmitCalls ||
                isUrlAlreadySubmitted ||
                urlCategoryMismatch ||
                isMissingGasBalance
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
            {isSubmitting ? (
              <TransactionStatusCallout
                className="mt-3"
                title={submittingStatus.title}
                description={submittingStatus.description}
              />
            ) : null}
          </div>
        </form>
      </div>

      {submittedContent ? (
        <ShareModal
          contentId={submittedContent.id}
          title={submittedContent.title}
          description={submittedContent.description}
          onClose={handleCloseShareModal}
        />
      ) : null}
    </>
  );
}
