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
import { readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { GasBalanceWarning } from "~~/components/shared/GasBalanceWarning";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { serializeTags } from "~~/constants/categories";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { type Category, useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import { useTransactionStatusToast } from "~~/hooks/useTransactionStatusToast";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import { MAX_CONTENT_DESCRIPTION_LENGTH } from "~~/lib/contentDescription";
import {
  MAX_SUBMISSION_IMAGE_URLS,
  isDirectImageUrl,
  isYouTubeVideoUrl,
  normalizeSubmissionContextUrl,
  normalizeSubmissionMediaUrl,
} from "~~/lib/contentMedia";
import { MAX_QUESTION_LENGTH } from "~~/lib/contentTitle";
import {
  findBlockedContentTags,
  getContentDescriptionValidationError,
  getContentTagValidationError,
  getContentTitleValidationError,
} from "~~/lib/moderation/submissionValidation";
import {
  DEFAULT_SUBMISSION_REWARD_POOL,
  ERC20_APPROVAL_ABI,
  MIN_REWARD_POOL_REQUIRED_VOTERS,
  MIN_REWARD_POOL_SETTLED_ROUNDS,
  QUESTION_SUBMISSION_ABI,
  SUBMISSION_REWARD_ASSET_CREP,
  SUBMISSION_REWARD_ASSET_USDC,
  type SubmissionRewardAsset,
  formatSubmissionRewardAmount,
  parseSubmissionRewardAmount,
} from "~~/lib/questionRewardPools";
import {
  getGasBalanceErrorMessage,
  isFreeTransactionExhaustedError,
  isInsufficientFundsError,
  isWalletRpcOverloadedError,
} from "~~/lib/transactionErrors";
import { containsBlockedUrl } from "~~/utils/contentFilter";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";
import { notification } from "~~/utils/scaffold-eth";

const ShareModal = dynamic(() => import("~~/components/submit/ShareModal").then(m => m.ShareModal), { ssr: false });

type MediaMode = "images" | "video";

const MEDIA_URL_CONFIG = {
  contextPlaceholder: "Paste the source or context link voters should judge",
  imagePlaceholder: "Paste a direct image URL, e.g. https://example.com/image.jpg",
  videoPlaceholder: "Paste a YouTube URL, e.g. https://youtube.com/watch?v=...",
  urlHint: "Optional. Add up to four direct image URLs or one YouTube link as a preview.",
};

type SubmissionStep = 1 | 2;
type RewardExpiryMode = "none" | "days";

function getRewardPoolExpiresAt(mode: RewardExpiryMode, daysText: string): bigint {
  if (mode !== "days") return 0n;

  const parsedDays = Math.floor(Number(daysText) || 0);
  if (parsedDays < 1) return 0n;
  return BigInt(Math.floor(Date.now() / 1000) + parsedDays * 24 * 60 * 60);
}

function parseIntegerInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.floor(parsed);
}

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

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <span
      className={`${className || "h-5 w-5"} inline-flex shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs font-semibold text-primary`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

export function ContentSubmissionSection() {
  const wagmiConfig = useConfig();
  const { address: connectedAddress } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { canSponsorTransactions, isMissingGasBalance, nativeTokenSymbol } = useGasBalanceStatus({
    includeExternalSendCalls: true,
  });
  const statusToast = useTransactionStatusToast();
  const { canUseSponsoredSubmitCalls, executeSponsoredCalls, isAwaitingSponsoredSubmitCalls } =
    useThirdwebSponsoredSubmitCalls();
  const { showWalletRpcOverloadNotification } = useWalletRpcRecovery();
  const { requireAcceptance } = useTermsAcceptance();

  const [mediaMode, setMediaMode] = useState<MediaMode>("images");
  const [contextUrl, setContextUrl] = useState("");
  const [contextUrlError, setContextUrlError] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([""]);
  const [imageUrlErrors, setImageUrlErrors] = useState<(string | null)[]>([null]);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoUrlError, setVideoUrlError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedSubcategories, setSelectedSubcategories] = useState<string[]>([]);
  const [customSubcategory, setCustomSubcategory] = useState("");
  const [rewardAsset, setRewardAsset] = useState<SubmissionRewardAsset>("usdc");
  const [rewardAmount, setRewardAmount] = useState("1");
  const [rewardRequiredVoters, setRewardRequiredVoters] = useState("3");
  const [rewardRequiredSettledRounds, setRewardRequiredSettledRounds] = useState("1");
  const [rewardExpiryMode, setRewardExpiryMode] = useState<RewardExpiryMode>("none");
  const [rewardExpiryDays, setRewardExpiryDays] = useState("30");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questionStepAttempted, setQuestionStepAttempted] = useState(false);
  const [bountyStepAttempted, setBountyStepAttempted] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep>(1);
  const [submittedContent, setSubmittedContent] = useState<{
    id: bigint;
    title: string;
    description: string;
    lastActivityAt: string;
  } | null>(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);

  const { categories, isLoading: categoriesLoading } = useCategoryRegistry();

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return categories;
    const search = categorySearch.toLowerCase();
    return categories.filter(
      cat =>
        cat.name.toLowerCase().includes(search) ||
        cat.slug.toLowerCase().includes(search) ||
        cat.subcategories.some(subcategory => subcategory.toLowerCase().includes(search)),
    );
  }, [categories, categorySearch]);

  const urlConfig = MEDIA_URL_CONFIG;
  const customSubcategoryError = customSubcategory ? getContentTagValidationError(customSubcategory) : null;

  const getContextUrlValidationError = (value: string): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return "Add a context link before asking.";
    }

    const sanitizedUrl = sanitizeExternalUrl(trimmedValue);
    if (!sanitizedUrl) {
      return "Please enter a valid HTTPS URL";
    }

    const urlCheck = containsBlockedUrl(sanitizedUrl);
    if (urlCheck.blocked) {
      return "This URL contains prohibited content and cannot be used";
    }

    return normalizeSubmissionContextUrl(trimmedValue) ? null : "Please enter a valid HTTPS URL";
  };

  const handleContextUrlChange = (value: string) => {
    setContextUrl(value);
    setContextUrlError(value.trim() ? getContextUrlValidationError(value) : null);
  };

  const getMediaUrlValidationError = (
    value: string,
    expectedType: MediaMode,
    options: { required?: boolean } = {},
  ): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return options.required
        ? expectedType === "video"
          ? "Add a YouTube URL before asking."
          : "Add at least one image URL before asking."
        : null;
    }

    const sanitizedUrl = sanitizeExternalUrl(trimmedValue);
    if (!sanitizedUrl) {
      return "Please enter a valid HTTPS URL";
    }

    const urlCheck = containsBlockedUrl(sanitizedUrl);
    if (urlCheck.blocked) {
      return "This URL contains prohibited content and cannot be used";
    }

    const normalizedUrl = normalizeSubmissionMediaUrl(trimmedValue);
    if (!normalizedUrl) {
      return "Please enter a valid HTTPS URL";
    }

    if (expectedType === "images" && !isDirectImageUrl(normalizedUrl)) {
      return "Use a direct image URL ending in JPG, PNG, WEBP, GIF, or AVIF.";
    }

    if (expectedType === "video" && !isYouTubeVideoUrl(normalizedUrl)) {
      return "Use a YouTube URL.";
    }

    return null;
  };

  const validateImageUrl = (index: number, value: string, required = false) => {
    const nextError = getMediaUrlValidationError(value, "images", { required });
    setImageUrlErrors(prev => {
      const next = [...prev];
      next[index] = nextError;
      return next;
    });
  };

  const handleImageUrlChange = (index: number, value: string) => {
    setImageUrls(prev => prev.map((url, itemIndex) => (itemIndex === index ? value : url)));
    validateImageUrl(index, value);
  };

  const handleAddImageUrl = () => {
    if (imageUrls.length >= MAX_SUBMISSION_IMAGE_URLS) return;
    setImageUrls(prev => [...prev, ""]);
    setImageUrlErrors(prev => [...prev, null]);
  };

  const handleRemoveImageUrl = (index: number) => {
    if (imageUrls.length === 1) {
      setImageUrls([""]);
      setImageUrlErrors([null]);
      return;
    }

    setImageUrls(prev => prev.filter((_, itemIndex) => itemIndex !== index));
    setImageUrlErrors(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const validateVideoUrl = (value: string, required = false) => {
    setVideoUrlError(getMediaUrlValidationError(value, "video", { required }));
  };

  const handleVideoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setVideoUrl(value);
    validateVideoUrl(value);
  };

  const normalizedImageUrls = useMemo(
    () =>
      imageUrls
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => normalizeSubmissionMediaUrl(value))
        .filter((value): value is string => Boolean(value)),
    [imageUrls],
  );
  const normalizedVideoUrl = useMemo(
    () => (videoUrl.trim() ? (normalizeSubmissionMediaUrl(videoUrl) ?? "") : ""),
    [videoUrl],
  );
  const normalizedContextUrl = useMemo(
    () => (contextUrl.trim() ? (normalizeSubmissionContextUrl(contextUrl) ?? "") : ""),
    [contextUrl],
  );
  const previewMediaUrl = mediaMode === "video" ? normalizedVideoUrl : (normalizedImageUrls[0] ?? "");
  const hasValidPreviewMedia =
    Boolean(previewMediaUrl) &&
    (mediaMode === "video"
      ? !videoUrlError && isYouTubeVideoUrl(previewMediaUrl)
      : !imageUrlErrors.some(Boolean) && isDirectImageUrl(previewMediaUrl));
  const previewUrl = hasValidPreviewMedia ? previewMediaUrl : normalizedContextUrl;

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category);
    setSelectedSubcategories([]);
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

  const { writeContractAsync: writeRegistry } = useScaffoldWriteContract({
    contractName: "ContentRegistry",
    disableSimulate: true,
  });
  const { data: registryInfo, isLoading: isRegistryLoading } = useDeployedContractInfo({
    contractName: "ContentRegistry",
  });
  const { data: crepInfo, isLoading: isCrepLoading } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const { data: rewardEscrowInfo, isLoading: isRewardEscrowLoading } = useDeployedContractInfo({
    contractName: "QuestionRewardPoolEscrow",
  });
  const registryAddress = registryInfo?.address as `0x${string}` | undefined;
  const crepAddress = crepInfo?.address as `0x${string}` | undefined;
  const rewardEscrowAddress = rewardEscrowInfo?.address as `0x${string}` | undefined;
  const { data: escrowUsdcToken } = useScaffoldReadContract({
    contractName: "QuestionRewardPoolEscrow" as any,
    functionName: "usdcToken" as any,
    watch: false,
    query: {
      staleTime: 300_000,
    },
  } as any);
  const { data: minSubmissionCrepPool } = useScaffoldReadContract({
    contractName: "ProtocolConfig" as any,
    functionName: "minSubmissionCrepPool" as any,
    watch: false,
    query: {
      staleTime: 300_000,
    },
  } as any);
  const { data: minSubmissionUsdcPool } = useScaffoldReadContract({
    contractName: "ProtocolConfig" as any,
    functionName: "minSubmissionUsdcPool" as any,
    watch: false,
    query: {
      staleTime: 300_000,
    },
  } as any);
  const selectedRewardAssetId = rewardAsset === "crep" ? SUBMISSION_REWARD_ASSET_CREP : SUBMISSION_REWARD_ASSET_USDC;
  const selectedRewardAmount = useMemo(() => parseSubmissionRewardAmount(rewardAmount), [rewardAmount]);
  const parsedRewardRequiredVoters = parseIntegerInput(rewardRequiredVoters);
  const parsedRewardRequiredSettledRounds = parseIntegerInput(rewardRequiredSettledRounds);
  const selectedRequiredVoters = BigInt(Math.max(MIN_REWARD_POOL_REQUIRED_VOTERS, parsedRewardRequiredVoters));
  const selectedRequiredSettledRounds = BigInt(
    Math.max(MIN_REWARD_POOL_SETTLED_ROUNDS, parsedRewardRequiredSettledRounds),
  );
  const bountyMinimumCoverageAmount = selectedRequiredVoters * selectedRequiredSettledRounds;
  const minimumRewardAmount =
    rewardAsset === "crep"
      ? typeof minSubmissionCrepPool === "bigint"
        ? minSubmissionCrepPool
        : DEFAULT_SUBMISSION_REWARD_POOL
      : typeof minSubmissionUsdcPool === "bigint"
        ? minSubmissionUsdcPool
        : DEFAULT_SUBMISSION_REWARD_POOL;
  const rewardAmountError =
    selectedRewardAmount === null
      ? "Enter a positive amount with up to 6 decimals."
      : selectedRewardAmount < minimumRewardAmount
        ? `Minimum is ${formatSubmissionRewardAmount(minimumRewardAmount, rewardAsset)}.`
        : selectedRewardAmount < bountyMinimumCoverageAmount
          ? `Minimum is ${formatSubmissionRewardAmount(
              bountyMinimumCoverageAmount,
              rewardAsset,
            )} for the selected voter requirements.`
          : null;
  const minimumBountyAmount =
    minimumRewardAmount > bountyMinimumCoverageAmount ? minimumRewardAmount : bountyMinimumCoverageAmount;
  const rewardRequiredVotersValidationError =
    parsedRewardRequiredVoters < MIN_REWARD_POOL_REQUIRED_VOTERS
      ? `Minimum is ${MIN_REWARD_POOL_REQUIRED_VOTERS} voters.`
      : null;
  const rewardRequiredVotersError = bountyStepAttempted ? rewardRequiredVotersValidationError : null;
  const rewardRequiredSettledRoundsValidationError =
    parsedRewardRequiredSettledRounds < MIN_REWARD_POOL_SETTLED_ROUNDS
      ? `Minimum is ${MIN_REWARD_POOL_SETTLED_ROUNDS} round.`
      : null;
  const rewardRequiredSettledRoundsError = bountyStepAttempted ? rewardRequiredSettledRoundsValidationError : null;
  const parsedRewardExpiryDays = parseIntegerInput(rewardExpiryDays);
  const rewardExpiryValidationError =
    rewardExpiryMode === "days" && parsedRewardExpiryDays < 1 ? "Enter at least 1 day or choose no expiry." : null;
  const rewardExpiryError = bountyStepAttempted ? rewardExpiryValidationError : null;
  const rewardPoolExpiresAt = getRewardPoolExpiresAt(rewardExpiryMode, rewardExpiryDays);
  const bountySettingsValid =
    rewardRequiredVotersValidationError === null &&
    rewardRequiredSettledRoundsValidationError === null &&
    rewardExpiryValidationError === null &&
    rewardAmountError === null &&
    selectedRewardAmount !== null;
  const rewardTokenAddress =
    rewardAsset === "crep" ? crepAddress : ((escrowUsdcToken as `0x${string}` | undefined) ?? undefined);
  const { refetch: refetchNextContentId } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "nextContentId",
  });
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

  const validateQuestionSection = () => {
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedContextUrl = contextUrl.trim();
    const submittedContextUrl = normalizeSubmissionContextUrl(trimmedContextUrl) ?? "";
    const submittedImageUrls =
      mediaMode === "images"
        ? imageUrls
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => normalizeSubmissionMediaUrl(value))
            .filter((value): value is string => Boolean(value))
        : [];
    const submittedVideoUrl = mediaMode === "video" ? (normalizeSubmissionMediaUrl(videoUrl) ?? "") : "";
    const nextImageUrlErrors = imageUrls.map(value =>
      value.trim() ? getMediaUrlValidationError(value, "images") : null,
    );
    const nextVideoUrlError = getMediaUrlValidationError(videoUrl, "video");
    const nextContextUrlError = getContextUrlValidationError(trimmedContextUrl);
    const nextTitleError = trimmedTitle ? getContentTitleValidationError(trimmedTitle) : null;
    const nextDescriptionError = trimmedDescription ? getContentDescriptionValidationError(trimmedDescription) : null;
    const blockedContentTags = findBlockedContentTags(selectedSubcategories);
    const hasMediaError =
      mediaMode === "images"
        ? nextImageUrlErrors.some(Boolean)
        : Boolean(nextVideoUrlError) || Boolean(videoUrl.trim() && !submittedVideoUrl);

    setImageUrlErrors(nextImageUrlErrors);
    setVideoUrlError(nextVideoUrlError);
    setContextUrlError(nextContextUrlError);
    setTitleError(nextTitleError);
    setDescriptionError(nextDescriptionError);

    const questionFieldsComplete =
      Boolean(selectedCategory) &&
      Boolean(trimmedTitle) &&
      Boolean(trimmedDescription) &&
      selectedSubcategories.length > 0 &&
      Boolean(submittedContextUrl);
    const hasQuestionErrors =
      !questionFieldsComplete ||
      Boolean(nextContextUrlError) ||
      Boolean(nextTitleError) ||
      Boolean(nextDescriptionError) ||
      hasMediaError ||
      blockedContentTags.length > 0;

    return {
      blockedContentTags,
      hasMediaError,
      hasQuestionErrors,
      submittedContextUrl,
      submittedImageUrls,
      submittedVideoUrl,
      trimmedDescription,
      trimmedTitle,
    };
  };

  const handleContinueToBounty = () => {
    setQuestionStepAttempted(true);
    const questionValidation = validateQuestionSection();
    if (questionValidation.hasQuestionErrors) {
      setSubmissionStep(1);
      notification.warning("Fill in the highlighted fields before continuing.");
      return;
    }

    setSubmissionStep(2);
    setBountyStepAttempted(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegistryLoading || isCrepLoading || isRewardEscrowLoading) {
      notification.warning("Submission is still loading. Try again in a moment.");
      return;
    }

    if (!registryInfo || !registryAddress || !crepInfo || !crepAddress || !rewardEscrowInfo || !rewardEscrowAddress) {
      notification.error("Submission is unavailable right now.");
      return;
    }

    if (!rewardTokenAddress) {
      notification.error(`${rewardAsset === "crep" ? "cREP" : "USDC"} funding is unavailable right now.`);
      return;
    }

    setQuestionStepAttempted(true);

    if (isAwaitingSponsoredSubmitCalls) {
      notification.warning("Wallet reconnecting. Retry in a moment.");
      return;
    }

    if (isMissingGasBalance) {
      notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
      return;
    }

    const questionValidation = validateQuestionSection();
    setBountyStepAttempted(true);
    const { submittedContextUrl, submittedImageUrls, submittedVideoUrl, trimmedDescription, trimmedTitle } =
      questionValidation;
    const submittedTitle = trimmedTitle;
    const submittedDescription = trimmedDescription;
    const currentCategory = selectedCategory;

    if (questionValidation.hasQuestionErrors) {
      setSubmissionStep(1);
      notification.warning("Fill in the highlighted fields before asking.");
      return;
    }

    if (!currentCategory) {
      notification.warning("Select a category before asking.");
      return;
    }

    if (!questionValidation.submittedContextUrl || !selectedRewardAmount) {
      notification.warning("Please fix the highlighted fields before asking.");
      return;
    }

    if (!bountySettingsValid) {
      setSubmissionStep(2);
      notification.warning("Please fix the bounty details before asking.");
      return;
    }

    const accepted = await requireAcceptance("submit");
    if (!accepted) return;

    setIsSubmitting(true);
    statusToast.showSubmitting({ action: "content" });
    let reservationStorageKey: string | null = null;
    try {
      let contentId: bigint | null = null;
      const submissionTags = serializeTags(selectedSubcategories);
      const submitterAddress = connectedAddress as `0x${string}` | undefined;
      if (!submitterAddress) {
        throw new Error("Wallet not connected");
      }

      const [, submissionKey] = (await readContract(wagmiConfig, {
        abi: QUESTION_SUBMISSION_ABI,
        address: registryAddress,
        functionName: "previewQuestionSubmissionKey",
        args: [
          submittedContextUrl,
          submittedImageUrls,
          submittedVideoUrl,
          submittedTitle,
          submittedDescription,
          submissionTags,
          currentCategory.id,
        ],
      })) as readonly [bigint, `0x${string}`];
      const submissionDraft = {
        categoryId: currentCategory.id,
        description: submittedDescription,
        imageUrls: submittedImageUrls,
        rewardAmount: selectedRewardAmount,
        rewardPoolExpiresAt,
        rewardAsset: selectedRewardAssetId,
        requiredSettledRounds: selectedRequiredSettledRounds,
        requiredVoters: selectedRequiredVoters,
        submissionKey,
        tags: submissionTags,
        title: submittedTitle,
        contextUrl: submittedContextUrl,
        videoUrl: submittedVideoUrl,
      };
      const currentReservationStorageKey = buildSubmissionReservationStorageKey(
        submitterAddress,
        targetNetwork.id,
        submissionKey,
      );
      reservationStorageKey = currentReservationStorageKey;

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
              suppressStatusToast: true,
            },
          );
          return;
        }

        const cancelTxHash = await writeRegistry(
          {
            functionName: "cancelReservedSubmission",
            args: [revealCommitment],
          },
          {
            suppressErrorToast: true,
            suppressStatusToast: true,
            suppressSuccessToast: true,
          },
        );

        if (cancelTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: cancelTxHash });
        }
      };

      const reserveSubmission = async (revealCommitment: `0x${string}`) => {
        if (canUseSponsoredSubmitCalls) {
          await executeSponsoredCalls(
            [
              {
                abi: registryInfo.abi,
                address: registryAddress,
                args: [revealCommitment],
                functionName: "reserveSubmission",
              },
            ],
            {
              atomicRequired: true,
              suppressStatusToast: true,
            },
          );
          return;
        }

        const reserveTxHash = await writeRegistry(
          {
            functionName: "reserveSubmission",
            args: [revealCommitment],
          },
          {
            suppressErrorToast: true,
            suppressStatusToast: true,
            suppressSuccessToast: true,
          },
        );

        if (reserveTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: reserveTxHash });
        }
      };

      let activeReservation = getStoredSubmissionReservation(currentReservationStorageKey);

      if (activeReservation && !submissionReservationMatchesDraft(activeReservation, submissionDraft)) {
        try {
          await cancelReservedSubmission(activeReservation.revealCommitment);
        } catch (error) {
          if (!isReservationNotFoundError(error)) {
            throw error;
          }
        }

        clearStoredSubmissionReservation(currentReservationStorageKey);
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
        setStoredSubmissionReservation(currentReservationStorageKey, activeReservation);
      }

      // ContentRegistry enforces a minimum reservation age before reveal.
      // Give the next block timestamp enough room to advance before submitQuestionWithReward.
      await new Promise(resolve => setTimeout(resolve, 1_100));

      if (canUseSponsoredSubmitCalls) {
        const callsResult = await executeSponsoredCalls(
          [
            {
              abi: ERC20_APPROVAL_ABI,
              address: rewardTokenAddress,
              args: [rewardEscrowAddress, selectedRewardAmount],
              functionName: "approve",
            },
            {
              abi: QUESTION_SUBMISSION_ABI,
              address: registryAddress,
              args: [
                submittedContextUrl,
                submittedImageUrls,
                submittedVideoUrl,
                submittedTitle,
                submittedDescription,
                submissionTags,
                currentCategory.id,
                activeReservation.salt,
                selectedRewardAssetId,
                selectedRewardAmount,
                selectedRequiredVoters,
                selectedRequiredSettledRounds,
                rewardPoolExpiresAt,
              ],
              functionName: "submitQuestionWithReward",
            },
          ],
          {
            atomicRequired: true,
            suppressStatusToast: true,
          },
        );

        contentId = extractSubmittedContentId((callsResult.receipts ?? []).flatMap(receipt => receipt.logs));
      } else {
        const approveTxHash = await writeContract(wagmiConfig, {
          address: rewardTokenAddress,
          abi: ERC20_APPROVAL_ABI,
          functionName: "approve",
          args: [rewardEscrowAddress, selectedRewardAmount],
        });

        if (approveTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: approveTxHash });
        }

        const submitTxHash = await writeContract(wagmiConfig, {
          address: registryAddress,
          abi: QUESTION_SUBMISSION_ABI,
          functionName: "submitQuestionWithReward",
          args: [
            submittedContextUrl,
            submittedImageUrls,
            submittedVideoUrl,
            submittedTitle,
            submittedDescription,
            submissionTags,
            currentCategory.id,
            activeReservation.salt,
            selectedRewardAssetId,
            selectedRewardAmount,
            selectedRequiredVoters,
            selectedRequiredSettledRounds,
            rewardPoolExpiresAt,
          ],
        });

        if (submitTxHash) {
          const submitReceipt = await waitForTransactionReceipt(wagmiConfig, { hash: submitTxHash });
          contentId = extractSubmittedContentId(submitReceipt.logs);
        }
      }

      await refetchNextContentId();
      clearStoredSubmissionReservation(reservationStorageKey);

      statusToast.dismiss();
      notification.success(
        `Question asked with a ${formatSubmissionRewardAmount(selectedRewardAmount, rewardAsset)} voter bounty.`,
      );
      const submittedQuestion =
        contentId !== null
          ? {
              id: contentId,
              title: submittedTitle,
              description: submittedDescription,
              lastActivityAt: new Date().toISOString(),
            }
          : null;
      setSubmittedContent(submittedQuestion);
      setMediaMode("images");
      setContextUrl("");
      setContextUrlError(null);
      setImageUrls([""]);
      setImageUrlErrors([null]);
      setVideoUrl("");
      setVideoUrlError(null);
      setTitle("");
      setTitleError(null);
      setDescription("");
      setDescriptionError(null);
      setSelectedCategory(null);
      setSelectedSubcategories([]);
      setCustomSubcategory("");
      setRewardAmount("1");
      setRewardRequiredVoters("3");
      setRewardRequiredSettledRounds("1");
      setRewardExpiryMode("none");
      setRewardExpiryDays("30");
      setQuestionStepAttempted(false);
      setBountyStepAttempted(false);
      setSubmissionStep(1);
    } catch (e: unknown) {
      console.error("Ask failed:", e);
      statusToast.dismiss();
      if (isFreeTransactionExhaustedError(e) || isInsufficientFundsError(e)) {
        notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
      } else if (isWalletRpcOverloadedError(e)) {
        showWalletRpcOverloadNotification();
      } else if (isReservationNotFoundError(e)) {
        if (reservationStorageKey) {
          clearStoredSubmissionReservation(reservationStorageKey);
        }
        notification.warning("Reservation expired. Retry asking.");
      } else if (isReservationExistsError(e)) {
        notification.warning("Reservation saved. Retry asking.");
      } else {
        notification.error(
          (e as { shortMessage?: string; message?: string } | undefined)?.shortMessage ||
            (e as { shortMessage?: string; message?: string } | undefined)?.message ||
            "Failed to ask question",
        );
      }
    } finally {
      setIsSubmitting(false);
      statusToast.dismiss();
    }
  };

  const handleCloseShareModal = () => {
    setSubmittedContent(null);
  };

  const contextMissing = questionStepAttempted && !normalizedContextUrl;
  const imageMediaMissing = false;
  const videoMediaMissing = false;

  return (
    <>
      <div className="surface-card rounded-2xl p-6 space-y-5" style={{ overflow: "visible" }}>
        <h1 className={surfaceSectionHeadingClassName}>Ask Question</h1>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] xl:items-start"
        >
          <div className="xl:col-span-2 flex items-center gap-2 text-sm font-medium text-base-content/55">
            <span className={submissionStep === 1 ? "text-primary" : ""}>1. Question</span>
            <span aria-hidden="true">→</span>
            <span className={submissionStep === 2 ? "text-primary" : ""}>2. Bounty</span>
          </div>

          <div className="space-y-5">
            <div>
              <label
                className={`mb-2 flex items-center gap-1.5 text-base font-medium ${
                  questionStepAttempted && !title.trim() ? "text-error" : ""
                }`}
              >
                Question
                <InfoTooltip text="Good questions are specific, subjective, and easy to compare. Focus on one clear thing voters can rate, avoid yes/no or factual prompts, and add context below." />
              </label>
              <input
                type="text"
                placeholder="Ask something subjective that voters can rate"
                className={`input input-bordered w-full bg-base-100 ${
                  titleError || (questionStepAttempted && !title.trim()) ? "input-error" : ""
                }`}
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                maxLength={MAX_QUESTION_LENGTH}
              />
              {questionStepAttempted && !title.trim() ? (
                <p className="mt-1 text-base text-error">Question is required.</p>
              ) : null}
              {titleError ? <p className="mt-1 text-base text-error">{titleError}</p> : null}
              <div className="mt-1 text-right">
                <span className="text-base text-base-content/30">
                  {title.length}/{MAX_QUESTION_LENGTH}
                </span>
              </div>
            </div>

            <div>
              <label
                className={`mb-2 block text-base font-medium ${questionStepAttempted && !description.trim() ? "text-error" : ""}`}
              >
                Description
              </label>
              <textarea
                placeholder="Add context voters should consider"
                className={`textarea textarea-bordered h-24 w-full bg-base-100 ${
                  descriptionError || (questionStepAttempted && !description.trim()) ? "textarea-error" : ""
                }`}
                value={description}
                onChange={e => handleDescriptionChange(e.target.value)}
                maxLength={MAX_CONTENT_DESCRIPTION_LENGTH}
              />
              {questionStepAttempted && !description.trim() ? (
                <p className="mt-1 text-base text-error">Description is required.</p>
              ) : null}
              {descriptionError ? <p className="mt-1 text-base text-error">{descriptionError}</p> : null}
              <div className="mt-1 text-right">
                <span className="text-base text-base-content/30">
                  {description.length}/{MAX_CONTENT_DESCRIPTION_LENGTH}
                </span>
              </div>
            </div>

            <div>
              <label
                className={`mb-2 flex items-center gap-1.5 text-base font-medium ${
                  contextMissing || contextUrlError ? "text-error" : ""
                }`}
              >
                Context Link
                <InfoTooltip text="Required. Use the canonical source, product page, article, proposal, or other HTTPS link that voters should judge." />
              </label>
              <input
                type="url"
                placeholder={urlConfig.contextPlaceholder}
                className={`input input-bordered w-full bg-base-100 ${
                  contextMissing || contextUrlError ? "input-error" : ""
                }`}
                value={contextUrl}
                onChange={e => handleContextUrlChange(e.target.value)}
                onBlur={() => setContextUrlError(getContextUrlValidationError(contextUrl))}
              />
              {contextMissing && !contextUrlError ? (
                <p className="mt-1 text-base text-error">Add a context link before asking.</p>
              ) : null}
              {contextUrlError ? <p className="mt-1 text-base text-error">{contextUrlError}</p> : null}
            </div>

            <div>
              <label
                className={`mb-2 flex items-center gap-1.5 text-base font-medium ${
                  imageMediaMissing || videoMediaMissing ? "text-error" : ""
                }`}
              >
                Media
                <span className="font-normal text-base-content/40">
                  {mediaMode === "images" ? `(1-${MAX_SUBMISSION_IMAGE_URLS} images)` : "(YouTube)"}
                </span>
                <InfoTooltip text={urlConfig.urlHint} />
              </label>
              <div className="mb-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={mediaMode === "images"}
                  onClick={() => setMediaMode("images")}
                  className={`btn btn-sm ${mediaMode === "images" ? "btn-primary" : "btn-outline"}`}
                >
                  Images
                </button>
                <button
                  type="button"
                  aria-pressed={mediaMode === "video"}
                  onClick={() => setMediaMode("video")}
                  className={`btn btn-sm ${mediaMode === "video" ? "btn-primary" : "btn-outline"}`}
                >
                  YouTube
                </button>
              </div>

              {mediaMode === "images" ? (
                <div className="space-y-2">
                  {imageUrls.map((imageUrl, index) => (
                    <div key={index} className="flex gap-2">
                      <input
                        type="url"
                        placeholder={urlConfig.imagePlaceholder}
                        className={`input input-bordered min-w-0 flex-1 bg-base-100 ${
                          imageUrlErrors[index] || (imageMediaMissing && index === 0) ? "input-error" : ""
                        }`}
                        value={imageUrl}
                        onChange={event => handleImageUrlChange(index, event.target.value)}
                        onBlur={() => validateImageUrl(index, imageUrl, imageMediaMissing && index === 0)}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveImageUrl(index)}
                        className="btn btn-outline btn-square"
                        aria-label={imageUrls.length === 1 ? "Clear image URL" : "Remove image URL"}
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {imageUrlErrors.map((error, index) =>
                    error ? (
                      <p key={index} className="text-base text-error">
                        {error}
                      </p>
                    ) : null,
                  )}
                  {imageMediaMissing && !imageUrlErrors.some(Boolean) ? (
                    <p className="text-base text-error">Add at least one image URL before asking.</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleAddImageUrl}
                    disabled={imageUrls.length >= MAX_SUBMISSION_IMAGE_URLS}
                    className="btn btn-outline btn-sm"
                  >
                    Add image
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="url"
                    placeholder={urlConfig.videoPlaceholder}
                    className={`input input-bordered w-full bg-base-100 ${
                      videoUrlError || videoMediaMissing ? "input-error" : ""
                    }`}
                    value={videoUrl}
                    onChange={handleVideoUrlChange}
                    onBlur={() => validateVideoUrl(videoUrl, videoMediaMissing)}
                  />
                  {videoUrlError ? <p className="mt-1 text-base text-error">{videoUrlError}</p> : null}
                  {videoMediaMissing && !videoUrlError ? (
                    <p className="mt-1 text-base text-error">Add a YouTube URL before asking.</p>
                  ) : null}
                </div>
              )}
            </div>

            <div ref={categoryDropdownRef} className="relative">
              <label
                className={`mb-2 block text-base font-medium ${questionStepAttempted && !selectedCategory ? "text-error" : ""}`}
              >
                Select Category
              </label>
              {categoriesLoading ? (
                <div className="input input-bordered flex w-full items-center bg-base-100">
                  <span className="loading loading-spinner loading-sm"></span>
                </div>
              ) : categories.length > 0 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                    className={`input input-bordered flex w-full cursor-pointer items-center justify-between bg-base-100 transition-colors hover:bg-base-200 ${
                      questionStepAttempted && !selectedCategory ? "input-error" : ""
                    }`}
                  >
                    {selectedCategory ? (
                      <div className="flex items-center gap-2">
                        <CategoryIcon name={selectedCategory.name} />
                        <span>{selectedCategory.name}</span>
                      </div>
                    ) : (
                      <span className="text-base-content/50">Select a category...</span>
                    )}
                    <ChevronDownIcon
                      className={`h-5 w-5 text-base-content/50 transition-transform ${isCategoryDropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  {questionStepAttempted && !selectedCategory ? (
                    <p className="mt-1 text-base text-error">Select a category before asking.</p>
                  ) : null}

                  {isCategoryDropdownOpen ? (
                    <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100 shadow-lg">
                      <div className="border-b border-base-300 p-2">
                        <div className="relative">
                          <MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-content/50" />
                          <input
                            type="text"
                            placeholder="Search categories..."
                            className="input input-sm w-full bg-base-200 pl-9 pr-8"
                            value={categorySearch}
                            onChange={e => setCategorySearch(e.target.value)}
                            autoFocus
                          />
                          {categorySearch ? (
                            <button
                              type="button"
                              onClick={() => setCategorySearch("")}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-base-content/50 hover:text-base-content"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="max-h-60 overflow-y-auto">
                        {filteredCategories.length > 0 ? (
                          filteredCategories.map(cat => {
                            const isSelected = selectedCategory?.id === cat.id;
                            return (
                              <button
                                key={cat.id.toString()}
                                type="button"
                                onClick={() => {
                                  handleCategorySelect(cat);
                                  setIsCategoryDropdownOpen(false);
                                  setCategorySearch("");
                                }}
                                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                  isSelected ? "bg-primary/10 text-primary" : "text-base-content hover:bg-base-200"
                                }`}
                              >
                                <CategoryIcon name={cat.name} />
                                <div className="flex flex-col">
                                  <span className="font-medium">{cat.name}</span>
                                </div>
                                {isSelected ? <span className="ml-auto text-primary">✓</span> : null}
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-4 py-3 text-base text-base-content/50">
                            No categories found for &quot;{categorySearch}&quot;
                          </div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-base text-base-content/50">No categories available.</p>
              )}
            </div>

            {selectedCategory ? (
              <div>
                <label
                  className={`mb-2 block text-base font-medium ${
                    questionStepAttempted && selectedSubcategories.length === 0 ? "text-error" : ""
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
                {questionStepAttempted && selectedSubcategories.length === 0 ? (
                  <p className="mt-2 text-base text-error">Pick at least one category before asking.</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-4 xl:sticky xl:top-24">
            {previewUrl || title || description ? (
              <div className="surface-card rounded-2xl p-4 space-y-3">
                <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
                {title ? <h3 className="line-clamp-2 text-lg font-semibold text-base-content">{title}</h3> : null}
                {previewUrl ? <ContentEmbed url={previewUrl} title={title} description={description} compact /> : null}
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
                  Add the question and context link to preview how it will appear.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-error/10 p-4">
              <p className="mb-2 text-base font-medium text-error">Prohibited Content</p>
              <p className="text-base text-base-content/70">
                Do not ask questions with illegal or harmful content. This includes but is not limited to: child
                exploitation material, non-consensual intimate imagery, content promoting violence or terrorism,
                doxxing, or copyright-infringing material. Violations may result in removal, blocked access, and
                potential legal action.
              </p>
            </div>

            {submissionStep === 2 ? (
              <div className="surface-card-nested rounded-2xl p-4 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="flex items-center gap-1.5 text-base font-medium text-base-content">
                    Bounty
                    <InfoTooltip text="Required and non-refundable. Set the terms that eligible voters must satisfy before payout." />
                  </p>
                  <span className="shrink-0 text-sm font-semibold text-base-content/60">
                    Min {formatSubmissionRewardAmount(minimumBountyAmount, rewardAsset)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    aria-pressed={rewardAsset === "usdc"}
                    onClick={() => setRewardAsset("usdc")}
                    className={`btn btn-sm ${rewardAsset === "usdc" ? "btn-primary" : "btn-outline"}`}
                  >
                    USDC
                  </button>
                  <button
                    type="button"
                    aria-pressed={rewardAsset === "crep"}
                    onClick={() => setRewardAsset("crep")}
                    className={`btn btn-sm ${rewardAsset === "crep" ? "btn-primary" : "btn-outline"}`}
                  >
                    cREP
                  </button>
                </div>

                <label
                  className={`input input-bordered flex items-center gap-2 bg-base-100 ${
                    bountyStepAttempted && rewardAmountError ? "input-error" : ""
                  }`}
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rewardAmount}
                    onChange={e => setRewardAmount(e.target.value)}
                    className="grow bg-transparent"
                    aria-label="Bounty amount"
                  />
                  <span className="text-sm font-semibold text-base-content/50">
                    {rewardAsset === "crep" ? "cREP" : "USDC"}
                  </span>
                </label>
                {bountyStepAttempted && rewardAmountError ? (
                  <p className="text-base text-error">{rewardAmountError}</p>
                ) : (
                  <p className="text-sm text-base-content/55">
                    Paid from your wallet into the escrow when the question is submitted.
                  </p>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="form-control">
                    <span className="label-text">Minimum voters</span>
                    <input
                      type="number"
                      min={MIN_REWARD_POOL_REQUIRED_VOTERS}
                      step={1}
                      value={rewardRequiredVoters}
                      onChange={e => setRewardRequiredVoters(e.target.value)}
                      className={`input input-bordered bg-base-100 ${
                        bountyStepAttempted && rewardRequiredVotersError ? "input-error" : ""
                      }`}
                    />
                    <span className="label-text-alt text-base-content/50">
                      At least {MIN_REWARD_POOL_REQUIRED_VOTERS} voters are required.
                    </span>
                  </label>

                  <label className="form-control">
                    <span className="label-text">Settlement rounds</span>
                    <input
                      type="number"
                      min={MIN_REWARD_POOL_SETTLED_ROUNDS}
                      step={1}
                      value={rewardRequiredSettledRounds}
                      onChange={e => setRewardRequiredSettledRounds(e.target.value)}
                      className={`input input-bordered bg-base-100 ${
                        bountyStepAttempted && rewardRequiredSettledRoundsError ? "input-error" : ""
                      }`}
                    />
                    <span className="label-text-alt text-base-content/50">
                      At least {MIN_REWARD_POOL_SETTLED_ROUNDS} round is required.
                    </span>
                  </label>
                </div>
                {bountyStepAttempted && rewardRequiredVotersError ? (
                  <p className="text-base text-error">{rewardRequiredVotersError}</p>
                ) : null}
                {bountyStepAttempted && rewardRequiredSettledRoundsError ? (
                  <p className="text-base text-error">{rewardRequiredSettledRoundsError}</p>
                ) : null}

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={rewardExpiryMode === "none"}
                      onClick={() => setRewardExpiryMode("none")}
                      className={`btn btn-sm ${rewardExpiryMode === "none" ? "btn-primary" : "btn-outline"}`}
                    >
                      No expiry
                    </button>
                    <button
                      type="button"
                      aria-pressed={rewardExpiryMode === "days"}
                      onClick={() => setRewardExpiryMode("days")}
                      className={`btn btn-sm ${rewardExpiryMode === "days" ? "btn-primary" : "btn-outline"}`}
                    >
                      Duration
                    </button>
                  </div>
                  {rewardExpiryMode === "days" ? (
                    <label className="form-control">
                      <span className="label-text">Expires after (days)</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={rewardExpiryDays}
                        onChange={e => setRewardExpiryDays(e.target.value)}
                        className={`input input-bordered bg-base-100 ${
                          bountyStepAttempted && rewardExpiryError ? "input-error" : ""
                        }`}
                      />
                      <span className="label-text-alt text-base-content/50">
                        Leave it off to keep the bounty open-ended.
                      </span>
                    </label>
                  ) : (
                    <p className="text-sm text-base-content/55">
                      The bounty stays open until it is filled or the contract rules move it along.
                    </p>
                  )}
                  {bountyStepAttempted && rewardExpiryError ? (
                    <p className="text-base text-error">{rewardExpiryError}</p>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="surface-card-nested rounded-2xl p-4 space-y-3">
                <p className="text-base font-medium text-base-content">Bounty</p>
                <p className="text-base text-base-content/60">
                  Finish the question step to configure the mandatory bounty, voters, and payout timing.
                </p>
                <button type="button" onClick={handleContinueToBounty} className="btn btn-primary w-full">
                  Continue to bounty
                </button>
              </div>
            )}

            {isMissingGasBalance ? <GasBalanceWarning nativeTokenSymbol={nativeTokenSymbol} /> : null}

            {submissionStep === 2 ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => {
                    setSubmissionStep(1);
                    setBountyStepAttempted(false);
                  }}
                  className="btn btn-ghost w-full sm:w-auto"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="btn btn-submit w-full"
                  disabled={isSubmitting || isAwaitingSponsoredSubmitCalls || isMissingGasBalance}
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <span className="loading loading-spinner loading-sm"></span>
                      Asking...
                    </span>
                  ) : (
                    "Ask Question"
                  )}
                </button>
              </div>
            ) : null}
          </div>
        </form>
      </div>

      {submittedContent ? (
        <ShareModal
          contentId={submittedContent.id}
          title={submittedContent.title}
          description={submittedContent.description}
          lastActivityAt={submittedContent.lastActivityAt}
          onClose={handleCloseShareModal}
        />
      ) : null}
    </>
  );
}
