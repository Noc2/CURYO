"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery } from "@tanstack/react-query";
import { decodeEventLog, toHex } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getPublicClient, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { ChevronDownIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { ContentEmbed } from "~~/components/content/ContentEmbed";
import { GasBalanceWarning } from "~~/components/shared/GasBalanceWarning";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { serializeTags } from "~~/constants/categories";
import { useTermsAcceptance } from "~~/contexts/TermsAcceptanceContext";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useLocalE2ETestWalletClient } from "~~/hooks/scaffold-eth/useLocalE2ETestWalletClient";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { type Category, useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import { fetchThumbnailMetadataBatch, shouldFetchMetadataUrl } from "~~/hooks/useContentFeedMetadata";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import { useTransactionStatusToast } from "~~/hooks/useTransactionStatusToast";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import { buildQuestionSpecHashes } from "~~/lib/agent/questionSpecs";
import {
  BOUNTY_WINDOW_PRESETS,
  type BountyWindowPreset,
  type BountyWindowUnit,
  DEFAULT_BOUNTY_WINDOW_PRESET,
  DEFAULT_CUSTOM_BOUNTY_WINDOW_AMOUNT,
  DEFAULT_CUSTOM_BOUNTY_WINDOW_UNIT,
  formatBountyWindowDuration,
  getBountyClosesAt,
  getBountyWindowSeconds,
  parseBountyWindowAmount,
  resolveBountyReferenceNowSeconds,
} from "~~/lib/bountyWindows";
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
  DEFAULT_REWARD_POOL_FRONTEND_FEE_BPS,
  DEFAULT_SUBMISSION_REWARD_POOL,
  ERC20_APPROVAL_ABI,
  MIN_REWARD_POOL_REQUIRED_VOTERS,
  QUESTION_SUBMISSION_ABI,
  SUBMISSION_REWARD_ASSET_HREP,
  SUBMISSION_REWARD_ASSET_USDC,
  type SubmissionRewardAsset,
  formatSubmissionRewardAmount,
  parseSubmissionRewardAmount,
} from "~~/lib/questionRewardPools";
import {
  DEFAULT_QUESTION_ROUND_CONFIG,
  DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS,
  formatDurationLabel,
  questionRoundConfigToAbi,
} from "~~/lib/questionRoundConfig";
import {
  buildQuestionBundleSubmissionRevealCommitment,
  buildQuestionSubmissionKey,
  buildQuestionSubmissionRevealCommitment,
} from "~~/lib/questionSubmissionCommitment";
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
  imageHint:
    "Optional. Add up to four direct image URLs. Landscape images fit the voting content area best; aim for 16:9 and at least 1280x720 px. Tall or square images may show extra padding.",
  videoHint: "Optional. Add one YouTube link as a preview; standard landscape videos fit the content area best.",
};

type SubmissionStep = "question" | "bounty";

const MAX_QUESTION_BUNDLE_COUNT = 10;
const BUNDLE_REQUIRED_SETTLED_ROUNDS = 1;

type QuestionDraft = {
  mediaMode: MediaMode;
  contextUrl: string;
  imageUrls: string[];
  videoUrl: string;
  title: string;
  description: string;
  selectedCategory: Category | null;
  selectedSubcategories: string[];
  customSubcategory: string;
};

type ValidatedQuestionDraft = {
  blockedContentTags: string[];
  hasMediaError: boolean;
  hasQuestionErrors: boolean;
  submittedContextUrl: string;
  submittedImageUrls: string[];
  submittedVideoUrl: string;
  submittedTags: string;
  trimmedDescription: string;
  trimmedTitle: string;
  selectedCategory: Category | null;
};

type QuestionTaxonomySelection = Pick<QuestionDraft, "selectedCategory" | "selectedSubcategories">;

function createEmptyQuestionDraft(): QuestionDraft {
  return {
    mediaMode: "images",
    contextUrl: "",
    imageUrls: [""],
    videoUrl: "",
    title: "",
    description: "",
    selectedCategory: null,
    selectedSubcategories: [],
    customSubcategory: "",
  };
}

function createQuestionDraftWithTaxonomy(source: QuestionTaxonomySelection): QuestionDraft {
  return {
    ...createEmptyQuestionDraft(),
    selectedCategory: source.selectedCategory,
    selectedSubcategories: [...source.selectedSubcategories],
  };
}

function areSubcategorySelectionsEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function areTaxonomySelectionsEqual(left: QuestionTaxonomySelection, right: QuestionTaxonomySelection): boolean {
  const leftCategoryId = left.selectedCategory?.id.toString() ?? null;
  const rightCategoryId = right.selectedCategory?.id.toString() ?? null;
  return (
    leftCategoryId === rightCategoryId &&
    areSubcategorySelectionsEqual(left.selectedSubcategories, right.selectedSubcategories)
  );
}

function shouldInheritFirstQuestionTaxonomy(
  draft: QuestionDraft,
  previousSelection: QuestionTaxonomySelection,
): boolean {
  if (!draft.selectedCategory && draft.selectedSubcategories.length === 0) {
    return true;
  }

  return areTaxonomySelectionsEqual(draft, previousSelection);
}

function syncFirstQuestionTaxonomy(
  drafts: QuestionDraft[],
  previousSelection: QuestionTaxonomySelection,
  nextSelection: QuestionTaxonomySelection,
): QuestionDraft[] {
  return drafts.map((draft, index) => {
    if (index !== 0 && !shouldInheritFirstQuestionTaxonomy(draft, previousSelection)) {
      return draft;
    }

    return {
      ...draft,
      selectedCategory: nextSelection.selectedCategory,
      selectedSubcategories: [...nextSelection.selectedSubcategories],
    };
  });
}

function createRandomHex32(): `0x${string}` {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return toHex(bytes);
}

function parseIntegerInput(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.floor(parsed);
}

function divideRewardAmount(total: bigint, divisor: bigint): bigint {
  return divisor > 0n ? total / divisor : 0n;
}

function applyEstimatedFrontendFee(amount: bigint, frontendFeeBps: number): bigint {
  const normalizedBps = Math.max(0, Math.min(10_000, Math.floor(frontendFeeBps)));
  const frontendFee = (amount * BigInt(normalizedBps)) / 10_000n;
  return amount > frontendFee ? amount - frontendFee : 0n;
}

function formatFrontendFeePercent(frontendFeeBps: number): string {
  const normalizedBps = Math.max(0, Math.min(10_000, Math.floor(frontendFeeBps)));
  const whole = Math.floor(normalizedBps / 100);
  const fractional = normalizedBps % 100;
  return fractional === 0 ? `${whole}%` : `${whole}.${String(fractional).padStart(2, "0").replace(/0+$/, "")}%`;
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
  const localE2ETestWalletClient = useLocalE2ETestWalletClient(connectedAddress, targetNetwork.id);
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
  const [questionCount, setQuestionCount] = useState(1);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);
  const [questionDrafts, setQuestionDrafts] = useState<QuestionDraft[]>([createEmptyQuestionDraft()]);
  const [rewardAsset, setRewardAsset] = useState<SubmissionRewardAsset>("usdc");
  const [rewardAmount, setRewardAmount] = useState("1");
  const [rewardRequiredVoters, setRewardRequiredVoters] = useState("3");
  const [bountyWindowPreset, setBountyWindowPreset] = useState<BountyWindowPreset>(DEFAULT_BOUNTY_WINDOW_PRESET);
  const [customBountyWindowAmount, setCustomBountyWindowAmount] = useState(DEFAULT_CUSTOM_BOUNTY_WINDOW_AMOUNT);
  const [customBountyWindowUnit, setCustomBountyWindowUnit] = useState<BountyWindowUnit>(
    DEFAULT_CUSTOM_BOUNTY_WINDOW_UNIT,
  );
  const [roundBlindMinutes, setRoundBlindMinutes] = useState(
    String(Number(DEFAULT_QUESTION_ROUND_CONFIG.epochDuration / 60n)),
  );
  const [roundMaxDurationHours, setRoundMaxDurationHours] = useState(
    String(Number(DEFAULT_QUESTION_ROUND_CONFIG.maxDuration / 3600n)),
  );
  const [roundMinVoters, setRoundMinVoters] = useState(String(DEFAULT_QUESTION_ROUND_CONFIG.minVoters));
  const [roundMaxVoters, setRoundMaxVoters] = useState(String(DEFAULT_QUESTION_ROUND_CONFIG.maxVoters));
  const [roundConfigTouched, setRoundConfigTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [questionStepAttempted, setQuestionStepAttempted] = useState(false);
  const [bountyStepAttempted, setBountyStepAttempted] = useState(false);
  const [submissionStep, setSubmissionStep] = useState<SubmissionStep>("question");
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

  const getActiveQuestionDraft = (): QuestionDraft => ({
    mediaMode,
    contextUrl,
    imageUrls,
    videoUrl,
    title,
    description,
    selectedCategory,
    selectedSubcategories,
    customSubcategory,
  });

  const patchActiveQuestionDraft = (patch: Partial<QuestionDraft>) => {
    setQuestionDrafts(prev =>
      prev.map((draft, index) => (index === activeQuestionIndex ? { ...draft, ...patch } : draft)),
    );
  };

  const loadQuestionDraft = (draft: QuestionDraft) => {
    setMediaMode(draft.mediaMode);
    setContextUrl(draft.contextUrl);
    setContextUrlError(null);
    setImageUrls(draft.imageUrls.length > 0 ? draft.imageUrls : [""]);
    setImageUrlErrors((draft.imageUrls.length > 0 ? draft.imageUrls : [""]).map(() => null));
    setVideoUrl(draft.videoUrl);
    setVideoUrlError(null);
    setTitle(draft.title);
    setTitleError(null);
    setDescription(draft.description);
    setDescriptionError(null);
    setSelectedCategory(draft.selectedCategory);
    setSelectedSubcategories(draft.selectedSubcategories);
    setCustomSubcategory(draft.customSubcategory);
    setQuestionStepAttempted(false);
    setIsCategoryDropdownOpen(false);
    setCategorySearch("");
  };

  const setActiveQuestionPage = (index: number, drafts = questionDrafts) => {
    const nextIndex = Math.max(0, Math.min(index, questionCount - 1));
    setActiveQuestionIndex(nextIndex);
    loadQuestionDraft(drafts[nextIndex] ?? createEmptyQuestionDraft());
    setSubmissionStep("question");
  };

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
    patchActiveQuestionDraft({ contextUrl: value });
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
    setImageUrls(prev => {
      const next = prev.map((url, itemIndex) => (itemIndex === index ? value : url));
      patchActiveQuestionDraft({ imageUrls: next });
      return next;
    });
    validateImageUrl(index, value);
  };

  const handleAddImageUrl = () => {
    if (imageUrls.length >= MAX_SUBMISSION_IMAGE_URLS) return;
    setImageUrls(prev => {
      const next = [...prev, ""];
      patchActiveQuestionDraft({ imageUrls: next });
      return next;
    });
    setImageUrlErrors(prev => [...prev, null]);
  };

  const handleRemoveImageUrl = (index: number) => {
    if (imageUrls.length === 1) {
      setImageUrls([""]);
      patchActiveQuestionDraft({ imageUrls: [""] });
      setImageUrlErrors([null]);
      return;
    }

    setImageUrls(prev => {
      const next = prev.filter((_, itemIndex) => itemIndex !== index);
      patchActiveQuestionDraft({ imageUrls: next });
      return next;
    });
    setImageUrlErrors(prev => prev.filter((_, itemIndex) => itemIndex !== index));
  };

  const validateVideoUrl = (value: string, required = false) => {
    setVideoUrlError(getMediaUrlValidationError(value, "video", { required }));
  };

  const handleVideoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setVideoUrl(value);
    patchActiveQuestionDraft({ videoUrl: value });
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
  const shouldUseContextLinkPreview = Boolean(normalizedContextUrl) && previewUrl === normalizedContextUrl;
  const shouldFetchContextPreviewMetadata =
    shouldUseContextLinkPreview &&
    !isDirectImageUrl(normalizedContextUrl) &&
    !isYouTubeVideoUrl(normalizedContextUrl) &&
    shouldFetchMetadataUrl(normalizedContextUrl);
  const { data: contextPreviewMetadataMap } = useQuery({
    queryKey: ["submissionContextPreviewMetadata", normalizedContextUrl],
    enabled: shouldFetchContextPreviewMetadata,
    staleTime: 60_000,
    queryFn: async () => fetchThumbnailMetadataBatch([normalizedContextUrl]),
  });
  const contextPreviewThumbnailUrl = shouldFetchContextPreviewMetadata
    ? (contextPreviewMetadataMap?.[normalizedContextUrl]?.thumbnailUrl ?? null)
    : null;

  const handleCategorySelect = (category: Category) => {
    const previousSelection = { selectedCategory, selectedSubcategories };
    const nextSelection: QuestionTaxonomySelection = { selectedCategory: category, selectedSubcategories: [] };
    setSelectedCategory(category);
    setSelectedSubcategories([]);
    if (activeQuestionIndex === 0) {
      setQuestionDrafts(prev => syncFirstQuestionTaxonomy(prev, previousSelection, nextSelection));
    } else {
      patchActiveQuestionDraft(nextSelection);
    }
  };

  const handleSubcategoryToggle = (subcategory: string) => {
    setSelectedSubcategories(prev => {
      let next = prev;
      if (prev.includes(subcategory)) {
        next = prev.filter(s => s !== subcategory);
      } else if (prev.length < 3) {
        next = [...prev, subcategory];
      }
      if (activeQuestionIndex === 0) {
        setQuestionDrafts(prevDrafts =>
          syncFirstQuestionTaxonomy(
            prevDrafts,
            { selectedCategory, selectedSubcategories: prev },
            { selectedCategory, selectedSubcategories: next },
          ),
        );
      } else {
        patchActiveQuestionDraft({ selectedSubcategories: next });
      }
      return next;
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
      setSelectedSubcategories(prev => {
        const next = [...prev, trimmed];
        if (activeQuestionIndex === 0) {
          setQuestionDrafts(prevDrafts =>
            syncFirstQuestionTaxonomy(
              prevDrafts,
              { selectedCategory, selectedSubcategories: prev },
              { selectedCategory, selectedSubcategories: next },
            ).map((draft, index) => (index === activeQuestionIndex ? { ...draft, customSubcategory: "" } : draft)),
          );
        } else {
          patchActiveQuestionDraft({ selectedSubcategories: next, customSubcategory: "" });
        }
        return next;
      });
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
  const { data: hrepInfo, isLoading: isHrepLoading } = useDeployedContractInfo({ contractName: "HumanReputation" });
  const { data: rewardEscrowInfo, isLoading: isRewardEscrowLoading } = useDeployedContractInfo({
    contractName: "QuestionRewardPoolEscrow",
  });
  const registryAddress = registryInfo?.address as `0x${string}` | undefined;
  const hrepAddress = hrepInfo?.address as `0x${string}` | undefined;
  const rewardEscrowAddress = rewardEscrowInfo?.address as `0x${string}` | undefined;
  const { data: escrowUsdcToken } = useScaffoldReadContract({
    contractName: "QuestionRewardPoolEscrow" as any,
    functionName: "usdcToken" as any,
    watch: false,
    query: {
      staleTime: 300_000,
    },
  } as any);
  const { data: defaultFrontendFeeBps } = useScaffoldReadContract({
    contractName: "QuestionRewardPoolEscrow" as any,
    functionName: "defaultFrontendFeeBps" as any,
    watch: false,
    query: {
      staleTime: 300_000,
    },
  } as any);
  const { data: minSubmissionHrepPool } = useScaffoldReadContract({
    contractName: "ProtocolConfig" as any,
    functionName: "minSubmissionHrepPool" as any,
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
  const { data: protocolRoundConfig } = useScaffoldReadContract({
    contractName: "ProtocolConfig" as any,
    functionName: "config" as any,
    watch: false,
    query: {
      staleTime: 300_000,
    },
  } as any);
  const { data: protocolRoundConfigBounds } = useScaffoldReadContract({
    contractName: "ProtocolConfig" as any,
    functionName: "roundConfigBounds" as any,
    watch: false,
    query: {
      staleTime: 300_000,
    },
  } as any);
  const roundConfigDefaults = useMemo(() => {
    const value = protocolRoundConfig as any;
    return {
      epochDuration: Number(value?.epochDuration ?? value?.[0] ?? DEFAULT_QUESTION_ROUND_CONFIG.epochDuration),
      maxDuration: Number(value?.maxDuration ?? value?.[1] ?? DEFAULT_QUESTION_ROUND_CONFIG.maxDuration),
      minVoters: Number(value?.minVoters ?? value?.[2] ?? DEFAULT_QUESTION_ROUND_CONFIG.minVoters),
      maxVoters: Number(value?.maxVoters ?? value?.[3] ?? DEFAULT_QUESTION_ROUND_CONFIG.maxVoters),
    };
  }, [protocolRoundConfig]);
  const roundConfigBounds = useMemo(() => {
    const value = protocolRoundConfigBounds as any;
    return {
      minEpochDuration: Number(
        value?.minEpochDuration ?? value?.[0] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.minEpochDuration,
      ),
      maxEpochDuration: Number(
        value?.maxEpochDuration ?? value?.[1] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.maxEpochDuration,
      ),
      minRoundDuration: Number(
        value?.minRoundDuration ?? value?.[2] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.minRoundDuration,
      ),
      maxRoundDuration: Number(
        value?.maxRoundDuration ?? value?.[3] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.maxRoundDuration,
      ),
      minSettlementVoters: Number(
        value?.minSettlementVoters ?? value?.[4] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.minSettlementVoters,
      ),
      maxSettlementVoters: Number(
        value?.maxSettlementVoters ?? value?.[5] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.maxSettlementVoters,
      ),
      minVoterCap: Number(value?.minVoterCap ?? value?.[6] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.minVoterCap),
      maxVoterCap: Number(value?.maxVoterCap ?? value?.[7] ?? DEFAULT_QUESTION_ROUND_CONFIG_BOUNDS.maxVoterCap),
    };
  }, [protocolRoundConfigBounds]);
  useEffect(() => {
    if (roundConfigTouched || !protocolRoundConfig) return;
    setRoundBlindMinutes(String(Math.max(1, Math.round(roundConfigDefaults.epochDuration / 60))));
    setRoundMaxDurationHours(String(Math.max(1, Math.round(roundConfigDefaults.maxDuration / 3600))));
    setRoundMinVoters(String(roundConfigDefaults.minVoters));
    setRoundMaxVoters(String(roundConfigDefaults.maxVoters));
  }, [protocolRoundConfig, roundConfigDefaults, roundConfigTouched]);
  const selectedRewardAssetId = rewardAsset === "hrep" ? SUBMISSION_REWARD_ASSET_HREP : SUBMISSION_REWARD_ASSET_USDC;
  const selectedRewardAmount = useMemo(() => parseSubmissionRewardAmount(rewardAmount), [rewardAmount]);
  const parsedRoundBlindMinutes = parseIntegerInput(roundBlindMinutes);
  const parsedRoundMaxDurationHours = parseIntegerInput(roundMaxDurationHours);
  const parsedRoundMinVoters = parseIntegerInput(roundMinVoters);
  const parsedRoundMaxVoters = parseIntegerInput(roundMaxVoters);
  const selectedRoundConfig = useMemo(
    () => ({
      epochDuration: BigInt(Math.max(0, parsedRoundBlindMinutes) * 60),
      maxDuration: BigInt(Math.max(0, parsedRoundMaxDurationHours) * 3600),
      minVoters: BigInt(Math.max(0, parsedRoundMinVoters)),
      maxVoters: BigInt(Math.max(0, parsedRoundMaxVoters)),
    }),
    [parsedRoundBlindMinutes, parsedRoundMaxDurationHours, parsedRoundMinVoters, parsedRoundMaxVoters],
  );
  const roundConfigValidationError = (() => {
    const epochDuration = Number(selectedRoundConfig.epochDuration);
    const maxDuration = Number(selectedRoundConfig.maxDuration);
    const minVoters = Number(selectedRoundConfig.minVoters);
    const maxVoters = Number(selectedRoundConfig.maxVoters);
    if (epochDuration < roundConfigBounds.minEpochDuration || epochDuration > roundConfigBounds.maxEpochDuration) {
      return `Blind phase must be ${formatDurationLabel(roundConfigBounds.minEpochDuration)}-${formatDurationLabel(
        roundConfigBounds.maxEpochDuration,
      )}.`;
    }
    if (maxDuration < roundConfigBounds.minRoundDuration || maxDuration > roundConfigBounds.maxRoundDuration) {
      return `Max duration must be ${formatDurationLabel(roundConfigBounds.minRoundDuration)}-${formatDurationLabel(
        roundConfigBounds.maxRoundDuration,
      )}.`;
    }
    if (minVoters < roundConfigBounds.minSettlementVoters || minVoters > roundConfigBounds.maxSettlementVoters) {
      return `Settlement voters must be ${roundConfigBounds.minSettlementVoters}-${roundConfigBounds.maxSettlementVoters}.`;
    }
    if (maxVoters < roundConfigBounds.minVoterCap || maxVoters > roundConfigBounds.maxVoterCap) {
      return `Voter cap must be ${roundConfigBounds.minVoterCap}-${roundConfigBounds.maxVoterCap}.`;
    }
    if (maxVoters < minVoters) {
      return "Voter cap must be at least the settlement voters.";
    }
    return null;
  })();
  const parsedRewardRequiredVoters = parseIntegerInput(rewardRequiredVoters);
  const selectedRequiredVoters = BigInt(Math.max(MIN_REWARD_POOL_REQUIRED_VOTERS, parsedRewardRequiredVoters));
  const selectedRequiredSettledRounds = BigInt(BUNDLE_REQUIRED_SETTLED_ROUNDS);
  const bountyMinimumCoverageAmount = selectedRequiredVoters * selectedRequiredSettledRounds;
  const minimumRewardAmount =
    rewardAsset === "hrep"
      ? typeof minSubmissionHrepPool === "bigint"
        ? minSubmissionHrepPool
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
      : selectedRequiredVoters > selectedRoundConfig.maxVoters
        ? "Bounty voters cannot exceed the question voter cap."
        : null;
  const rewardRequiredVotersError = bountyStepAttempted ? rewardRequiredVotersValidationError : null;
  const bountyWindowSeconds = getBountyWindowSeconds(
    bountyWindowPreset,
    customBountyWindowAmount,
    customBountyWindowUnit,
  );
  const parsedCustomBountyWindowAmount = parseBountyWindowAmount(customBountyWindowAmount);
  const rewardExpiryValidationError =
    bountyWindowPreset === "custom" && parsedCustomBountyWindowAmount < 1
      ? `Enter at least 1 ${customBountyWindowUnit === "hours" ? "hour" : "day"}.`
      : bountyWindowSeconds === null
        ? "Choose a bounty window."
        : null;
  const rewardExpiryError = bountyStepAttempted ? rewardExpiryValidationError : null;
  const bountySettingsValid =
    rewardRequiredVotersValidationError === null &&
    rewardExpiryValidationError === null &&
    roundConfigValidationError === null &&
    rewardAmountError === null &&
    selectedRewardAmount !== null;
  const frontendFeeBps =
    typeof defaultFrontendFeeBps === "bigint"
      ? Number(defaultFrontendFeeBps)
      : typeof defaultFrontendFeeBps === "number"
        ? defaultFrontendFeeBps
        : DEFAULT_REWARD_POOL_FRONTEND_FEE_BPS;
  const estimatedBountyAmount = selectedRewardAmount ?? minimumBountyAmount;
  const estimatedQuestionShare = divideRewardAmount(estimatedBountyAmount, BigInt(questionCount));
  const estimatedMinimumVoterGrossReward = divideRewardAmount(estimatedBountyAmount, selectedRequiredVoters);
  const estimatedMinimumVoterReward = applyEstimatedFrontendFee(estimatedMinimumVoterGrossReward, frontendFeeBps);
  const estimatedVoterCap = BigInt(Math.max(0, parsedRoundMaxVoters));
  const estimatedVoterCapGrossReward = divideRewardAmount(estimatedBountyAmount, estimatedVoterCap);
  const estimatedVoterCapReward = applyEstimatedFrontendFee(estimatedVoterCapGrossReward, frontendFeeBps);
  const bountyWindowLabel = formatBountyWindowDuration(bountyWindowSeconds);
  const oneTokenPerMinimumVoterBounty = selectedRequiredVoters * selectedRequiredSettledRounds * 1_000_000n;
  const bountyRecommendation = rewardAmountError
    ? "Increase the bounty until the estimate is valid before submitting."
    : rewardRequiredVotersValidationError
      ? "Lower minimum voters or raise the voter cap so the bounty can qualify."
      : estimatedMinimumVoterReward < 1_000_000n
        ? `For a stronger signal, consider ${formatSubmissionRewardAmount(
            oneTokenPerMinimumVoterBounty,
            rewardAsset,
          )} or more so the minimum cohort earns about 1 ${rewardAsset === "hrep" ? "HREP" : "USDC"} each.`
        : parsedRoundMaxVoters > Math.max(parsedRewardRequiredVoters, 1) * 3
          ? "A wide voter cap can dilute the per-voter payout if participation is high; use it when broader input matters more than payout density."
          : "These settings give a clear payout target for a small qualifying round.";
  const rewardTokenAddress =
    rewardAsset === "hrep" ? hrepAddress : ((escrowUsdcToken as `0x${string}` | undefined) ?? undefined);
  const { refetch: refetchNextContentId } = useScaffoldReadContract({
    contractName: "ContentRegistry",
    functionName: "nextContentId",
  });
  const extractSubmittedContentIds = (logs: { address: string; data: `0x${string}`; topics: `0x${string}`[] }[]) => {
    if (!registryInfo) {
      return [];
    }

    const submittedContentIds: bigint[] = [];
    for (const log of logs) {
      if (log.address.toLowerCase() !== registryInfo.address.toLowerCase()) {
        continue;
      }

      try {
        const decoded = decodeEventLog({
          abi: registryInfo.abi,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });
        const args = decoded.args as { contentId?: unknown } | undefined;
        if (decoded.eventName === "ContentSubmitted" && typeof args?.contentId === "bigint") {
          submittedContentIds.push(args.contentId);
        }
      } catch {
        continue;
      }
    }

    return submittedContentIds;
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    patchActiveQuestionDraft({ title: value });
    setTitleError(getContentTitleValidationError(value));
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    patchActiveQuestionDraft({ description: value });
    setDescriptionError(getContentDescriptionValidationError(value));
  };

  const validateQuestionSection = (draft = getActiveQuestionDraft(), applyErrors = true): ValidatedQuestionDraft => {
    const trimmedTitle = draft.title.trim();
    const trimmedDescription = draft.description.trim();
    const trimmedContextUrl = draft.contextUrl.trim();
    const submittedContextUrl = normalizeSubmissionContextUrl(trimmedContextUrl) ?? "";
    const submittedImageUrls =
      draft.mediaMode === "images"
        ? draft.imageUrls
            .map(value => value.trim())
            .filter(Boolean)
            .map(value => normalizeSubmissionMediaUrl(value))
            .filter((value): value is string => Boolean(value))
        : [];
    const submittedVideoUrl = draft.mediaMode === "video" ? (normalizeSubmissionMediaUrl(draft.videoUrl) ?? "") : "";
    const nextImageUrlErrors = draft.imageUrls.map(value =>
      value.trim() ? getMediaUrlValidationError(value, "images") : null,
    );
    const nextVideoUrlError = getMediaUrlValidationError(draft.videoUrl, "video");
    const nextContextUrlError = getContextUrlValidationError(trimmedContextUrl);
    const nextTitleError = trimmedTitle ? getContentTitleValidationError(trimmedTitle) : null;
    const nextDescriptionError = trimmedDescription ? getContentDescriptionValidationError(trimmedDescription) : null;
    const blockedContentTags = findBlockedContentTags(draft.selectedSubcategories);
    const hasMediaError =
      draft.mediaMode === "images"
        ? nextImageUrlErrors.some(Boolean)
        : Boolean(nextVideoUrlError) || Boolean(draft.videoUrl.trim() && !submittedVideoUrl);

    if (applyErrors) {
      setImageUrlErrors(nextImageUrlErrors);
      setVideoUrlError(nextVideoUrlError);
      setContextUrlError(nextContextUrlError);
      setTitleError(nextTitleError);
      setDescriptionError(nextDescriptionError);
    }

    const questionFieldsComplete =
      Boolean(draft.selectedCategory) &&
      Boolean(trimmedTitle) &&
      draft.selectedSubcategories.length > 0 &&
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
      selectedCategory: draft.selectedCategory,
      submittedContextUrl,
      submittedImageUrls,
      submittedVideoUrl,
      submittedTags: serializeTags(draft.selectedSubcategories),
      trimmedDescription,
      trimmedTitle,
    };
  };

  const handleContinueToBounty = () => {
    setQuestionStepAttempted(true);
    const questionValidation = validateQuestionSection();
    if (questionValidation.hasQuestionErrors) {
      setSubmissionStep("question");
      notification.warning("Fill in the highlighted fields before continuing.");
      return;
    }

    if (activeQuestionIndex < questionCount - 1) {
      const nextDrafts = questionDrafts.map((draft, index) =>
        index === activeQuestionIndex ? getActiveQuestionDraft() : draft,
      );
      setQuestionDrafts(nextDrafts);
      setActiveQuestionPage(activeQuestionIndex + 1, nextDrafts);
      return;
    }

    setSubmissionStep("bounty");
    setBountyStepAttempted(false);
  };

  const handleGoToPreviousQuestion = () => {
    if (activeQuestionIndex <= 0) return;

    const nextDrafts = questionDrafts.map((draft, index) =>
      index === activeQuestionIndex ? getActiveQuestionDraft() : draft,
    );
    setQuestionDrafts(nextDrafts);
    setActiveQuestionPage(activeQuestionIndex - 1, nextDrafts);
    setBountyStepAttempted(false);
  };

  const handleGoToBountyStep = () => {
    if (submissionStep === "bounty") return;

    const syncedDrafts = questionDrafts
      .map((draft, index) => (index === activeQuestionIndex ? getActiveQuestionDraft() : draft))
      .slice(0, questionCount);
    const validatedQuestions = syncedDrafts.map(draft => validateQuestionSection(draft, false));
    const firstInvalidQuestionIndex = validatedQuestions.findIndex(question => question.hasQuestionErrors);
    if (firstInvalidQuestionIndex >= 0) {
      const invalidDraft = syncedDrafts[firstInvalidQuestionIndex] ?? createEmptyQuestionDraft();
      setQuestionDrafts(syncedDrafts);
      setActiveQuestionIndex(firstInvalidQuestionIndex);
      loadQuestionDraft(invalidDraft);
      setQuestionStepAttempted(true);
      validateQuestionSection(invalidDraft, true);
      setSubmissionStep("question");
      notification.warning("Fill in every question page before opening bounty details.");
      return;
    }

    setQuestionDrafts(syncedDrafts);
    setSubmissionStep("bounty");
    setBountyStepAttempted(false);
  };

  const handleQuestionCountChange = (value: string) => {
    const nextCount = Math.max(1, Math.min(MAX_QUESTION_BUNDLE_COUNT, parseIntegerInput(value)));
    const syncedDrafts = questionDrafts.map((draft, index) =>
      index === activeQuestionIndex ? getActiveQuestionDraft() : draft,
    );
    const nextDrafts =
      nextCount > syncedDrafts.length
        ? [
            ...syncedDrafts,
            ...Array.from({ length: nextCount - syncedDrafts.length }, () =>
              createQuestionDraftWithTaxonomy(syncedDrafts[0] ?? createEmptyQuestionDraft()),
            ),
          ]
        : syncedDrafts.slice(0, nextCount);
    const nextActiveIndex = Math.min(activeQuestionIndex, nextCount - 1);

    setQuestionCount(nextCount);
    setQuestionDrafts(nextDrafts);
    setActiveQuestionIndex(nextActiveIndex);
    loadQuestionDraft(nextDrafts[nextActiveIndex] ?? createEmptyQuestionDraft());
    setSubmissionStep("question");
    setBountyStepAttempted(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegistryLoading || isHrepLoading || isRewardEscrowLoading) {
      notification.warning("Submission is still loading. Try again in a moment.");
      return;
    }

    if (!registryInfo || !registryAddress || !hrepInfo || !hrepAddress || !rewardEscrowInfo || !rewardEscrowAddress) {
      notification.error("Submission is unavailable right now.");
      return;
    }

    if (!rewardTokenAddress) {
      notification.error(`${rewardAsset === "hrep" ? "HREP" : "USDC"} funding is unavailable right now.`);
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

    const syncedDrafts = questionDrafts
      .map((draft, index) => (index === activeQuestionIndex ? getActiveQuestionDraft() : draft))
      .slice(0, questionCount);
    const validatedQuestions = syncedDrafts.map(draft => validateQuestionSection(draft, false));
    const firstInvalidQuestionIndex = validatedQuestions.findIndex(question => question.hasQuestionErrors);
    if (firstInvalidQuestionIndex >= 0) {
      const invalidDraft = syncedDrafts[firstInvalidQuestionIndex] ?? createEmptyQuestionDraft();
      setQuestionDrafts(syncedDrafts);
      setActiveQuestionIndex(firstInvalidQuestionIndex);
      loadQuestionDraft(invalidDraft);
      setQuestionStepAttempted(true);
      validateQuestionSection(invalidDraft, true);
      setSubmissionStep("question");
      notification.warning("Fill in every question page before asking.");
      return;
    }

    setQuestionDrafts(syncedDrafts);
    setBountyStepAttempted(true);
    if (!selectedRewardAmount) {
      notification.warning("Please fix the highlighted fields before asking.");
      return;
    }

    if (!bountySettingsValid) {
      setSubmissionStep("bounty");
      notification.warning("Please fix the bounty details before asking.");
      return;
    }

    const accepted = await requireAcceptance("submit");
    if (!accepted) return;

    setIsSubmitting(true);
    statusToast.showSubmitting({ action: "content" });
    let reservedRevealCommitment: `0x${string}` | null = null;
    let cancelReservedSubmission: ((revealCommitment: `0x${string}`) => Promise<void>) | null = null;
    try {
      let submittedContentIds: bigint[] = [];
      const submitterAddress = connectedAddress as `0x${string}` | undefined;
      if (!submitterAddress) {
        throw new Error("Wallet not connected");
      }
      const publicClient = getPublicClient(wagmiConfig, { chainId: targetNetwork.id as any });
      const latestBlockTimestamp = await publicClient
        ?.getBlock({ blockTag: "latest" })
        .then(block => block.timestamp)
        .catch(() => undefined);
      const rewardPoolExpiresAt = getBountyClosesAt(
        bountyWindowPreset,
        customBountyWindowAmount,
        customBountyWindowUnit,
        resolveBountyReferenceNowSeconds(latestBlockTimestamp),
      );
      if (rewardPoolExpiresAt <= 0n) {
        setSubmissionStep("bounty");
        notification.warning("Choose a bounty window before asking.");
        return;
      }
      const feedbackClosesAt = rewardPoolExpiresAt;

      const bundleQuestions = validatedQuestions.map((question, index) => {
        if (!question.selectedCategory) {
          throw new Error(`Question ${index + 1} is missing a category.`);
        }

        const spec = buildQuestionSpecHashes({
          bounty: {
            amount: selectedRewardAmount,
            asset: rewardAsset === "hrep" ? "HREP" : "USDC",
            requiredSettledRounds: selectedRequiredSettledRounds,
            requiredVoters: selectedRequiredVoters,
          },
          categoryId: question.selectedCategory.id,
          contextUrl: question.submittedContextUrl,
          description: question.trimmedDescription,
          imageUrls: question.submittedImageUrls,
          roundConfig: selectedRoundConfig,
          study: {
            bundleIndex: index,
          },
          tags: question.submittedTags.split(",").filter(Boolean),
          title: question.trimmedTitle,
          videoUrl: question.submittedVideoUrl,
        });

        return {
          contextUrl: question.submittedContextUrl,
          imageUrls: question.submittedImageUrls,
          videoUrl: question.submittedVideoUrl,
          title: question.trimmedTitle,
          description: question.trimmedDescription,
          tags: question.submittedTags,
          categoryId: question.selectedCategory.id,
          salt: createRandomHex32(),
          spec: {
            questionMetadataHash: spec.questionMetadataHash,
            resultSpecHash: spec.resultSpecHash,
          },
        };
      });
      const rewardTerms = {
        asset: selectedRewardAssetId,
        amount: selectedRewardAmount,
        requiredVoters: selectedRequiredVoters,
        requiredSettledRounds: selectedRequiredSettledRounds,
        bountyClosesAt: rewardPoolExpiresAt,
        feedbackClosesAt,
      } as const;
      const roundConfigAbi = questionRoundConfigToAbi(selectedRoundConfig);
      const isBundleSubmission = bundleQuestions.length > 1;
      const primaryQuestion = bundleQuestions[0];
      if (!primaryQuestion) {
        throw new Error("Question is missing.");
      }
      const revealCommitment = isBundleSubmission
        ? buildQuestionBundleSubmissionRevealCommitment({
            questions: bundleQuestions,
            rewardAmount: selectedRewardAmount,
            rewardAsset: selectedRewardAssetId,
            requiredSettledRounds: selectedRequiredSettledRounds,
            requiredVoters: selectedRequiredVoters,
            rewardPoolExpiresAt,
            feedbackClosesAt,
            roundConfig: selectedRoundConfig,
            submitter: submitterAddress,
          })
        : buildQuestionSubmissionRevealCommitment({
            categoryId: primaryQuestion.categoryId,
            description: primaryQuestion.description,
            imageUrls: primaryQuestion.imageUrls,
            questionMetadataHash: primaryQuestion.spec.questionMetadataHash,
            rewardAmount: selectedRewardAmount,
            rewardAsset: selectedRewardAssetId,
            requiredSettledRounds: selectedRequiredSettledRounds,
            requiredVoters: selectedRequiredVoters,
            resultSpecHash: primaryQuestion.spec.resultSpecHash,
            rewardPoolExpiresAt,
            feedbackClosesAt,
            roundConfig: selectedRoundConfig,
            salt: primaryQuestion.salt,
            submissionKey: buildQuestionSubmissionKey(primaryQuestion),
            submitter: submitterAddress,
            tags: primaryQuestion.tags,
            title: primaryQuestion.title,
            videoUrl: primaryQuestion.videoUrl,
          });

      cancelReservedSubmission = async (revealCommitment: `0x${string}`) => {
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

      await reserveSubmission(revealCommitment);
      reservedRevealCommitment = revealCommitment;

      // ContentRegistry enforces a minimum reservation age before reveal.
      // Give the next block timestamp enough room to advance before the reveal submit.
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
              args: isBundleSubmission
                ? [bundleQuestions, rewardTerms, roundConfigAbi]
                : [
                    primaryQuestion.contextUrl,
                    primaryQuestion.imageUrls,
                    primaryQuestion.videoUrl,
                    primaryQuestion.title,
                    primaryQuestion.description,
                    primaryQuestion.tags,
                    primaryQuestion.categoryId,
                    primaryQuestion.salt,
                    rewardTerms,
                    roundConfigAbi,
                    primaryQuestion.spec,
                  ],
              functionName: isBundleSubmission
                ? "submitQuestionBundleWithRewardAndRoundConfig"
                : "submitQuestionWithRewardAndRoundConfig",
            },
          ],
          {
            atomicRequired: true,
            suppressStatusToast: true,
          },
        );

        submittedContentIds = extractSubmittedContentIds((callsResult.receipts ?? []).flatMap(receipt => receipt.logs));
      } else {
        const approveWrite = {
          address: rewardTokenAddress,
          abi: ERC20_APPROVAL_ABI,
          functionName: "approve",
          args: [rewardEscrowAddress, selectedRewardAmount],
        } as const;
        const approveTxHash = localE2ETestWalletClient
          ? await localE2ETestWalletClient.writeContract(approveWrite as any)
          : await writeContract(wagmiConfig, approveWrite);

        if (approveTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: approveTxHash });
        }

        const submitWrite = isBundleSubmission
          ? ({
              address: registryAddress,
              abi: QUESTION_SUBMISSION_ABI,
              functionName: "submitQuestionBundleWithRewardAndRoundConfig",
              args: [bundleQuestions, rewardTerms, roundConfigAbi],
            } as const)
          : ({
              address: registryAddress,
              abi: QUESTION_SUBMISSION_ABI,
              functionName: "submitQuestionWithRewardAndRoundConfig",
              args: [
                primaryQuestion.contextUrl,
                primaryQuestion.imageUrls,
                primaryQuestion.videoUrl,
                primaryQuestion.title,
                primaryQuestion.description,
                primaryQuestion.tags,
                primaryQuestion.categoryId,
                primaryQuestion.salt,
                rewardTerms,
                roundConfigAbi,
                primaryQuestion.spec,
              ],
            } as const);
        const submitTxHash = localE2ETestWalletClient
          ? await localE2ETestWalletClient.writeContract(submitWrite as any)
          : await writeContract(wagmiConfig, submitWrite as any);

        if (submitTxHash) {
          const submitReceipt = await waitForTransactionReceipt(wagmiConfig, { hash: submitTxHash });
          submittedContentIds = extractSubmittedContentIds(submitReceipt.logs);
        }
      }

      await refetchNextContentId();

      statusToast.dismiss();
      notification.success(
        `${questionCount === 1 ? "Question" : "Question bundle"} asked with a ${formatSubmissionRewardAmount(
          selectedRewardAmount,
          rewardAsset,
        )} voter bounty.`,
      );
      const primarySubmittedQuestion = validatedQuestions[0];
      const primaryContentId = submittedContentIds[0] ?? null;
      const submittedQuestion =
        primaryContentId !== null && primarySubmittedQuestion
          ? {
              id: primaryContentId,
              title: primarySubmittedQuestion.trimmedTitle,
              description:
                questionCount > 1
                  ? `${questionCount} question bundle. Answer all questions to qualify for the bounty.`
                  : primarySubmittedQuestion.trimmedDescription,
              lastActivityAt: new Date().toISOString(),
            }
          : null;
      setSubmittedContent(submittedQuestion);
      const emptyDraft = createEmptyQuestionDraft();
      setQuestionCount(1);
      setActiveQuestionIndex(0);
      setQuestionDrafts([emptyDraft]);
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
      setBountyWindowPreset(DEFAULT_BOUNTY_WINDOW_PRESET);
      setCustomBountyWindowAmount(DEFAULT_CUSTOM_BOUNTY_WINDOW_AMOUNT);
      setCustomBountyWindowUnit(DEFAULT_CUSTOM_BOUNTY_WINDOW_UNIT);
      setRoundBlindMinutes(String(Math.max(1, Math.round(roundConfigDefaults.epochDuration / 60))));
      setRoundMaxDurationHours(String(Math.max(1, Math.round(roundConfigDefaults.maxDuration / 3600))));
      setRoundMinVoters(String(roundConfigDefaults.minVoters));
      setRoundMaxVoters(String(roundConfigDefaults.maxVoters));
      setRoundConfigTouched(false);
      setQuestionStepAttempted(false);
      setBountyStepAttempted(false);
      setSubmissionStep("question");
    } catch (e: unknown) {
      console.error("Ask failed:", e);
      if (reservedRevealCommitment && cancelReservedSubmission) {
        try {
          await cancelReservedSubmission(reservedRevealCommitment);
        } catch (cancelError) {
          if (!isReservationNotFoundError(cancelError)) {
            console.warn("Failed to cancel reserved bundle submission:", cancelError);
          }
        }
      }
      statusToast.dismiss();
      if (isFreeTransactionExhaustedError(e) || isInsufficientFundsError(e)) {
        notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
      } else if (isWalletRpcOverloadedError(e)) {
        showWalletRpcOverloadNotification();
      } else if (isReservationNotFoundError(e)) {
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
  const pageHeading = submissionStep === "question" ? "Ask Question" : "Bounty";
  const pageContext =
    submissionStep === "question"
      ? `Question ${activeQuestionIndex + 1} of ${questionCount}`
      : questionCount > 1
        ? `${questionCount} question bundle`
        : "Single question bounty";

  const submissionStepIndicator = (
    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-base-content/55">
      {Array.from({ length: questionCount }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-current={submissionStep === "question" && activeQuestionIndex === index ? "step" : undefined}
          aria-label={`Go to question ${index + 1}`}
          onClick={() => setActiveQuestionPage(index)}
          title={`Go to question ${index + 1}`}
          className={`cursor-pointer rounded-md border px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
            submissionStep === "question" && activeQuestionIndex === index
              ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
              : "border-transparent hover:border-base-content/25 hover:bg-base-200 hover:text-base-content"
          }`}
        >
          Q{index + 1}
        </button>
      ))}
      <span aria-hidden="true">→</span>
      <button
        type="button"
        aria-current={submissionStep === "bounty" ? "step" : undefined}
        aria-label="Go to bounty details"
        onClick={handleGoToBountyStep}
        title="Go to bounty details"
        className={`cursor-pointer rounded-md border px-2 py-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
          submissionStep === "bounty"
            ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
            : "border-transparent hover:border-base-content/25 hover:bg-base-200 hover:text-base-content"
        }`}
      >
        Bounty
      </button>
    </div>
  );

  const questionPreviewCard =
    previewUrl || title || description ? (
      <div className="surface-card rounded-2xl p-4 space-y-3">
        <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
        {title ? <h3 className="line-clamp-2 text-lg font-semibold text-base-content">{title}</h3> : null}
        {previewUrl ? (
          <ContentEmbed
            url={previewUrl}
            title={title}
            description={description}
            thumbnailUrl={contextPreviewThumbnailUrl}
            compact
          />
        ) : null}
        {description ? <p className="text-base text-base-content/70">{description}</p> : null}
        {selectedSubcategories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedSubcategories.map(tag => (
              <span key={tag} className="rounded-full bg-primary/10 px-2 py-0.5 text-base font-medium text-primary">
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
    );

  const prohibitedContentNotice = (
    <div className="rounded-lg bg-error/10 p-4">
      <p className="mb-2 text-base font-medium text-error">Prohibited Content</p>
      <p className="text-base text-base-content/70">
        Do not ask questions with illegal or harmful content. This includes but is not limited to: child exploitation
        material, non-consensual intimate imagery, content promoting violence or terrorism, doxxing, or
        copyright-infringing material. Violations may result in removal, blocked access, and potential legal action.
      </p>
    </div>
  );

  const bountyTooltipText =
    "Required and non-refundable. Paid from your wallet into escrow when the question is submitted. Set the terms that eligible voters must satisfy before payout.";
  const requiredVotersTooltipText = `At least ${MIN_REWARD_POOL_REQUIRED_VOTERS} completers are required. Each paid completer must answer every question in the bundle.`;
  const requiredRoundsTooltipText = `Bundle rewards currently require exactly ${BUNDLE_REQUIRED_SETTLED_ROUNDS} settled round before payout.`;
  const roundSettingsTooltipText =
    "Governance sets the allowed range. Urgent bounties can use shorter rounds; broader questions can wait for more voters.";
  const bountyExpiryTooltipText =
    "Bounty and paid feedback are active only inside this window. The question remains visible after the bounty closes.";

  const bountyDetailsCard = (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-1.5 text-base font-medium text-base-content">
          Bounty
          <InfoTooltip text={bountyTooltipText} />
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
          aria-pressed={rewardAsset === "hrep"}
          onClick={() => setRewardAsset("hrep")}
          className={`btn btn-sm ${rewardAsset === "hrep" ? "btn-primary" : "btn-outline"}`}
        >
          HREP
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
        <span className="text-sm font-semibold text-base-content/50">{rewardAsset === "hrep" ? "HREP" : "USDC"}</span>
      </label>
      {bountyStepAttempted && rewardAmountError ? <p className="text-base text-error">{rewardAmountError}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="form-control">
          <span className="label-text flex items-center gap-1.5">
            Paid completers
            <InfoTooltip text={requiredVotersTooltipText} />
          </span>
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
        </div>

        <div className="form-control">
          <span className="label-text flex items-center gap-1.5">
            Settlement rounds
            <InfoTooltip text={requiredRoundsTooltipText} />
          </span>
          <input
            type="number"
            min={BUNDLE_REQUIRED_SETTLED_ROUNDS}
            max={BUNDLE_REQUIRED_SETTLED_ROUNDS}
            step={1}
            value={BUNDLE_REQUIRED_SETTLED_ROUNDS}
            readOnly
            aria-readonly="true"
            className="input input-bordered bg-base-100"
          />
        </div>
      </div>
      {bountyStepAttempted && rewardRequiredVotersError ? (
        <p className="text-base text-error">{rewardRequiredVotersError}</p>
      ) : null}

      <div className="space-y-3 pt-2">
        <div className="flex items-start justify-between gap-3">
          <p className="flex items-center gap-1.5 text-base font-medium text-base-content">
            Round settings
            <InfoTooltip text={roundSettingsTooltipText} />
          </p>
          <span className="text-sm font-semibold text-base-content/50">
            Default {formatDurationLabel(roundConfigDefaults.epochDuration)}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="form-control">
            <span className="label-text">Blind phase (minutes)</span>
            <input
              type="number"
              min={Math.ceil(roundConfigBounds.minEpochDuration / 60)}
              max={Math.floor(roundConfigBounds.maxEpochDuration / 60)}
              step={1}
              value={roundBlindMinutes}
              onChange={e => {
                setRoundConfigTouched(true);
                setRoundBlindMinutes(e.target.value);
              }}
              className={`input input-bordered bg-base-100 ${
                bountyStepAttempted && roundConfigValidationError ? "input-error" : ""
              }`}
            />
          </label>

          <label className="form-control">
            <span className="label-text">Max duration (hours)</span>
            <input
              type="number"
              min={Math.ceil(roundConfigBounds.minRoundDuration / 3600)}
              max={Math.floor(roundConfigBounds.maxRoundDuration / 3600)}
              step={1}
              value={roundMaxDurationHours}
              onChange={e => {
                setRoundConfigTouched(true);
                setRoundMaxDurationHours(e.target.value);
              }}
              className={`input input-bordered bg-base-100 ${
                bountyStepAttempted && roundConfigValidationError ? "input-error" : ""
              }`}
            />
          </label>

          <label className="form-control">
            <span className="label-text">Settlement voters</span>
            <input
              type="number"
              min={roundConfigBounds.minSettlementVoters}
              max={roundConfigBounds.maxSettlementVoters}
              step={1}
              value={roundMinVoters}
              onChange={e => {
                setRoundConfigTouched(true);
                setRoundMinVoters(e.target.value);
              }}
              className={`input input-bordered bg-base-100 ${
                bountyStepAttempted && roundConfigValidationError ? "input-error" : ""
              }`}
            />
          </label>

          <label className="form-control">
            <span className="label-text">Voter cap</span>
            <input
              type="number"
              min={roundConfigBounds.minVoterCap}
              max={roundConfigBounds.maxVoterCap}
              step={1}
              value={roundMaxVoters}
              onChange={e => {
                setRoundConfigTouched(true);
                setRoundMaxVoters(e.target.value);
              }}
              className={`input input-bordered bg-base-100 ${
                bountyStepAttempted && roundConfigValidationError ? "input-error" : ""
              }`}
            />
          </label>
        </div>

        {bountyStepAttempted && roundConfigValidationError ? (
          <p className="text-base text-error">{roundConfigValidationError}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <p className="flex items-center gap-1.5 text-sm font-medium text-base-content/80">
          Bounty window
          <InfoTooltip text={bountyExpiryTooltipText} />
        </p>
        <div className="grid grid-cols-3 gap-2">
          {BOUNTY_WINDOW_PRESETS.map(option => (
            <button
              key={option.id}
              type="button"
              aria-pressed={bountyWindowPreset === option.id}
              onClick={() => setBountyWindowPreset(option.id)}
              className={`btn btn-sm ${bountyWindowPreset === option.id ? "btn-primary" : "btn-outline"}`}
            >
              {option.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={bountyWindowPreset === "custom"}
            onClick={() => setBountyWindowPreset("custom")}
            className={`btn btn-sm ${bountyWindowPreset === "custom" ? "btn-primary" : "btn-outline"}`}
          >
            Custom
          </button>
        </div>
        {bountyWindowPreset === "custom" ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_8rem]">
            <label className="form-control">
              <span className="label-text">Window length</span>
              <input
                type="number"
                min={1}
                step={1}
                value={customBountyWindowAmount}
                onChange={e => setCustomBountyWindowAmount(e.target.value)}
                className={`input input-bordered bg-base-100 ${
                  bountyStepAttempted && rewardExpiryError ? "input-error" : ""
                }`}
              />
            </label>
            <label className="form-control">
              <span className="label-text">Unit</span>
              <select
                value={customBountyWindowUnit}
                onChange={e => setCustomBountyWindowUnit(e.target.value as BountyWindowUnit)}
                className="select select-bordered bg-base-100"
              >
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </label>
          </div>
        ) : (
          <label className="form-control">
            <span className="label-text">Selected window</span>
            <input
              value={bountyWindowLabel}
              readOnly
              className="input input-bordered bg-base-100 text-base-content/70"
            />
          </label>
        )}
        {bountyStepAttempted && rewardExpiryError ? <p className="text-base text-error">{rewardExpiryError}</p> : null}
      </div>
    </div>
  );

  const bountyInsightsCard = (
    <div className="space-y-4">
      <div className="surface-card rounded-2xl p-4 space-y-4">
        <div>
          <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Bounty estimate</p>
          <p className="mt-2 text-base text-base-content/65">
            {selectedRewardAmount === null
              ? "Using the current minimum until the bounty amount is valid."
              : `${formatFrontendFeePercent(frontendFeeBps)} may be reserved for an eligible frontend operator.`}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <div className="rounded-lg bg-base-100/70 p-3">
            <p className="text-sm font-medium uppercase text-base-content/45">Total bounty</p>
            <p className="mt-1 text-lg font-semibold text-base-content">
              {formatSubmissionRewardAmount(estimatedBountyAmount, rewardAsset)}
            </p>
          </div>
          <div className="rounded-lg bg-base-100/70 p-3">
            <p className="text-sm font-medium uppercase text-base-content/45">Per question</p>
            <p className="mt-1 text-lg font-semibold text-base-content">
              {formatSubmissionRewardAmount(estimatedQuestionShare, rewardAsset)}
            </p>
          </div>
          <div className="rounded-lg bg-base-100/70 p-3">
            <p className="text-sm font-medium uppercase text-base-content/45">Paid completers</p>
            <p className="mt-1 text-lg font-semibold text-base-content">
              {selectedRequiredVoters.toString()} wallet{selectedRequiredVoters === 1n ? "" : "s"}
            </p>
          </div>
          <div className="rounded-lg bg-base-100/70 p-3">
            <p className="text-sm font-medium uppercase text-base-content/45">Questions</p>
            <p className="mt-1 text-lg font-semibold text-base-content">{questionCount}</p>
          </div>
          <div className="rounded-lg bg-base-100/70 p-3">
            <p className="text-sm font-medium uppercase text-base-content/45">Bounty window</p>
            <p className="mt-1 text-lg font-semibold text-base-content">{bountyWindowLabel}</p>
          </div>
        </div>

        <div className="rounded-lg bg-primary/10 p-3">
          <p className="text-sm font-medium uppercase text-primary/80">Per paid completer</p>
          <p className="mt-1 text-xl font-semibold text-base-content">
            {formatSubmissionRewardAmount(estimatedMinimumVoterReward, rewardAsset)}
          </p>
          <p className="mt-1 text-sm text-base-content/60">
            Estimated claim after answering all {questionCount} question{questionCount === 1 ? "" : "s"}.
          </p>
        </div>

        <div className="rounded-lg bg-base-100/70 p-3">
          <p className="text-sm font-medium uppercase text-base-content/45">If every question reaches cap</p>
          <p className="mt-1 text-lg font-semibold text-base-content">
            {formatSubmissionRewardAmount(estimatedVoterCapReward, rewardAsset)}
          </p>
          <p className="mt-1 text-sm text-base-content/60">
            Estimated per completer if every question fills the selected voter cap.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-primary/10 p-4">
        <p className="mb-2 text-base font-medium text-primary">Recommendation</p>
        <p className="text-base text-base-content/70">{bountyRecommendation}</p>
      </div>
    </div>
  );

  const bountyActions = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <button
        type="button"
        onClick={() => {
          setSubmissionStep("question");
          setBountyStepAttempted(false);
        }}
        className="btn btn-ghost w-full sm:w-auto"
      >
        Back
      </button>
      <button
        type="submit"
        className="btn btn-submit w-full sm:flex-1"
        disabled={isSubmitting || isAwaitingSponsoredSubmitCalls || isMissingGasBalance}
      >
        {isSubmitting ? (
          <span className="flex items-center gap-2">
            <span className="loading loading-spinner loading-sm"></span>
            Submitting...
          </span>
        ) : (
          "Submit"
        )}
      </button>
    </div>
  );

  return (
    <>
      <div className="surface-card rounded-2xl p-6 space-y-5" style={{ overflow: "visible" }}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className={surfaceSectionHeadingClassName}>{pageHeading}</h1>
            <p className="mt-1 text-sm font-medium text-base-content/50">{pageContext}</p>
          </div>
          <label
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end ${surfaceSectionHeadingClassName}`}
          >
            <span className="flex items-center gap-2">
              Number of Questions
              <InfoTooltip text="Choose how many separate questions voters must answer in this ask. The bounty is split across all questions." />
            </span>
            <input
              type="number"
              min={1}
              max={MAX_QUESTION_BUNDLE_COUNT}
              step={1}
              value={questionCount}
              onChange={event => handleQuestionCountChange(event.target.value)}
              className="h-10 w-14 rounded-lg border border-base-content/25 bg-base-100 px-2 text-center text-2xl font-semibold leading-none text-base-content shadow-inner outline-none transition-colors hover:border-base-content/40 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/25"
              aria-label="Number of questions"
            />
          </label>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          {submissionStepIndicator}

          {submissionStep === "question" ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] xl:items-start">
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
                  <label className="mb-2 block text-base font-medium">
                    Description <span className="text-base-content/45">(optional)</span>
                  </label>
                  <textarea
                    placeholder="Add context voters should consider"
                    className={`textarea textarea-bordered h-24 w-full bg-base-100 ${
                      descriptionError ? "textarea-error" : ""
                    }`}
                    value={description}
                    onChange={e => handleDescriptionChange(e.target.value)}
                    maxLength={MAX_CONTENT_DESCRIPTION_LENGTH}
                  />
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
                    Media <span className="font-normal text-base-content/40">(optional)</span>
                    <span className="font-normal text-base-content/40">
                      {mediaMode === "images" ? `(1-${MAX_SUBMISSION_IMAGE_URLS} images)` : "(YouTube)"}
                    </span>
                    <InfoTooltip text={mediaMode === "images" ? urlConfig.imageHint : urlConfig.videoHint} />
                  </label>
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      aria-pressed={mediaMode === "images"}
                      onClick={() => {
                        setMediaMode("images");
                        patchActiveQuestionDraft({ mediaMode: "images" });
                      }}
                      className={`btn btn-sm ${mediaMode === "images" ? "btn-primary" : "btn-outline"}`}
                    >
                      Images
                    </button>
                    <button
                      type="button"
                      aria-pressed={mediaMode === "video"}
                      onClick={() => {
                        setMediaMode("video");
                        patchActiveQuestionDraft({ mediaMode: "video" });
                      }}
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
                    <div className="mt-3">
                      <p className="mb-2 text-sm font-medium text-base-content/60">Custom category (optional)</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add custom category..."
                          className={`input input-bordered input-sm flex-1 bg-base-100 ${customSubcategoryError ? "input-error" : ""}`}
                          value={customSubcategory}
                          onChange={e => {
                            setCustomSubcategory(e.target.value);
                            patchActiveQuestionDraft({ customSubcategory: e.target.value });
                          }}
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
                    </div>
                    {customSubcategoryError ? (
                      <p className="mt-2 text-base text-error">{customSubcategoryError}</p>
                    ) : null}
                    {questionStepAttempted && selectedSubcategories.length === 0 ? (
                      <p className="mt-2 text-base text-error">Pick at least one category before asking.</p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4 xl:sticky xl:top-24">
                {questionPreviewCard}
                {prohibitedContentNotice}
                {isMissingGasBalance ? <GasBalanceWarning nativeTokenSymbol={nativeTokenSymbol} /> : null}
                {activeQuestionIndex > 0 ? (
                  <button type="button" onClick={handleGoToPreviousQuestion} className="btn btn-ghost w-full">
                    Back to Q{activeQuestionIndex}
                  </button>
                ) : null}
                <button type="button" onClick={handleContinueToBounty} className="btn btn-primary w-full">
                  {activeQuestionIndex < questionCount - 1
                    ? `Next Question (${activeQuestionIndex + 2}/${questionCount})`
                    : "Continue to Bounty"}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] xl:items-start">
              <div className="space-y-4">{bountyDetailsCard}</div>
              <div className="space-y-4 xl:sticky xl:top-24">
                {bountyInsightsCard}
                {isMissingGasBalance ? <GasBalanceWarning nativeTokenSymbol={nativeTokenSymbol} /> : null}
                {bountyActions}
              </div>
            </div>
          )}
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
