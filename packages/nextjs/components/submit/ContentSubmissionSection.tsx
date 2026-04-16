"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  buildLegacySubmissionReservationStorageKey,
  buildSubmissionReservationStorageKey,
  buildSubmissionRevealCommitment,
  clearStoredSubmissionReservation,
  createStoredSubmissionReservation,
  deriveSubmissionReservationSalt,
  getLegacyStoredSubmissionReservation,
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
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import { useTransactionStatusToast } from "~~/hooks/useTransactionStatusToast";
import { useWalletRpcRecovery } from "~~/hooks/useWalletRpcRecovery";
import { MAX_CONTENT_DESCRIPTION_LENGTH } from "~~/lib/contentDescription";
import {
  MAX_SUBMISSION_IMAGE_URLS,
  isDirectImageUrl,
  isYouTubeVideoUrl,
  normalizeSubmissionMediaUrl,
} from "~~/lib/contentMedia";
import { MAX_QUESTION_LENGTH } from "~~/lib/contentTitle";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";
import {
  findBlockedContentTags,
  getContentDescriptionValidationError,
  getContentTagValidationError,
  getContentTitleValidationError,
} from "~~/lib/moderation/submissionValidation";
import { QUESTION_SUBMISSION_ABI } from "~~/lib/questionRewardPools";
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
  imagePlaceholder: "Paste a direct image URL, e.g. https://example.com/image.jpg",
  videoPlaceholder: "Paste a YouTube URL, e.g. https://youtube.com/watch?v=...",
  urlHint: "Required. Add up to four direct image URLs or one YouTube link for voters to judge.",
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

function getPendingSubmissionSubmitter(pendingSubmission: unknown): string | null {
  if (Array.isArray(pendingSubmission)) {
    return typeof pendingSubmission[0] === "string" ? pendingSubmission[0] : null;
  }

  const submitter = (pendingSubmission as { submitter?: unknown } | null | undefined)?.submitter;
  return typeof submitter === "string" ? submitter : null;
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
  const { ratePercent, calculateBonus } = useParticipationRate();
  const { canUseSponsoredSubmitCalls, executeSponsoredCalls, isAwaitingSponsoredSubmitCalls } =
    useThirdwebSponsoredSubmitCalls();
  const { showWalletRpcOverloadNotification } = useWalletRpcRecovery();
  const submissionBonus = calculateBonus(10);
  const { requireAcceptance } = useTermsAcceptance();

  const [mediaMode, setMediaMode] = useState<MediaMode>("images");
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
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

  const getMediaUrlValidationError = (
    value: string,
    expectedType: MediaMode,
    options: { required?: boolean } = {},
  ): string | null => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return options.required
        ? expectedType === "video"
          ? "Add a YouTube URL before submitting."
          : "Add at least one image URL before submitting."
        : null;
    }

    const sanitizedUrl = sanitizeExternalUrl(trimmedValue);
    if (!sanitizedUrl) {
      return "Please enter a valid HTTPS URL";
    }

    const urlCheck = containsBlockedUrl(sanitizedUrl);
    if (urlCheck.blocked) {
      return "This URL contains prohibited content and cannot be submitted";
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
  const previewMediaUrl = mediaMode === "video" ? normalizedVideoUrl : (normalizedImageUrls[0] ?? "");
  const hasValidPreviewMedia =
    Boolean(previewMediaUrl) &&
    (mediaMode === "video"
      ? !videoUrlError && isYouTubeVideoUrl(previewMediaUrl)
      : !imageUrlErrors.some(Boolean) && isDirectImageUrl(previewMediaUrl));

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
    const nextVideoUrlError = getMediaUrlValidationError(videoUrl, "video", { required: mediaMode === "video" });

    if (mediaMode === "images" && submittedImageUrls.length === 0) {
      nextImageUrlErrors[0] = "Add at least one image URL before submitting.";
    }

    const nextTitleError = trimmedTitle ? getContentTitleValidationError(trimmedTitle) : null;
    const nextDescriptionError = trimmedDescription ? getContentDescriptionValidationError(trimmedDescription) : null;
    const blockedContentTags = findBlockedContentTags(selectedSubcategories);
    const hasMediaError =
      mediaMode === "images" ? nextImageUrlErrors.some(Boolean) : Boolean(nextVideoUrlError) || !submittedVideoUrl;
    const normalizedSubmissionUrl = mediaMode === "video" ? submittedVideoUrl : (submittedImageUrls[0] ?? "");

    setImageUrlErrors(nextImageUrlErrors);
    setVideoUrlError(nextVideoUrlError);
    setTitleError(nextTitleError);
    setDescriptionError(nextDescriptionError);

    if (!selectedCategory || !trimmedTitle || !trimmedDescription || selectedSubcategories.length === 0) {
      notification.warning("Fill in the highlighted fields before submitting.");
      return;
    }

    if (blockedContentTags.length > 0) {
      notification.warning("Remove categories with prohibited content before submitting.");
      return;
    }

    if (hasMediaError || nextTitleError || nextDescriptionError) {
      notification.warning("Please fix the highlighted fields before submitting.");
      return;
    }

    const accepted = await requireAcceptance("submit");
    if (!accepted) return;

    setIsSubmitting(true);
    statusToast.showSubmitting({ action: "content" });
    const submittedTitle = trimmedTitle;
    const submittedDescription = trimmedDescription;
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
        abi: QUESTION_SUBMISSION_ABI,
        address: registryAddress,
        functionName: "previewQuestionMediaSubmissionKey",
        args: [
          submittedImageUrls,
          submittedVideoUrl,
          submittedTitle,
          submittedDescription,
          submissionTags,
          selectedCategory.id,
        ],
      })) as readonly [bigint, `0x${string}`];
      const submissionDraft = {
        categoryId: selectedCategory.id,
        description: submittedDescription,
        imageUrls: submittedImageUrls,
        submissionKey,
        tags: submissionTags,
        title: submittedTitle,
        url: normalizedSubmissionUrl,
        videoUrl: submittedVideoUrl,
      };
      const currentReservationStorageKey = buildSubmissionReservationStorageKey(
        submitterAddress,
        targetNetwork.id,
        submissionKey,
      );
      reservationStorageKey = currentReservationStorageKey;
      const legacyReservationStorageKey = buildLegacySubmissionReservationStorageKey(submitterAddress, submissionKey);

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
              suppressStatusToast: true,
            },
          );
          return;
        }

        const approveTxHash = await writeCRep(
          { functionName: "approve", args: [registryAddress, stakeAmount] },
          {
            blockConfirmations: 1,
            suppressErrorToast: true,
            suppressStatusToast: true,
            suppressSuccessToast: true,
          },
        );

        if (approveTxHash) {
          await waitForTransactionReceipt(wagmiConfig, { hash: approveTxHash });
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

      const migrateLegacyReservation = async () => {
        if (legacyReservationStorageKey === currentReservationStorageKey) {
          return null;
        }

        const legacyReservation = getLegacyStoredSubmissionReservation(legacyReservationStorageKey, targetNetwork.id);
        if (!legacyReservation) {
          return null;
        }

        try {
          const pendingSubmission = await readContract(wagmiConfig, {
            abi: registryInfo.abi,
            address: registryAddress,
            functionName: "pendingSubmissions",
            args: [legacyReservation.revealCommitment],
          });
          const pendingSubmitter = getPendingSubmissionSubmitter(pendingSubmission);
          if (!pendingSubmitter || pendingSubmitter.toLowerCase() !== submitterAddress.toLowerCase()) {
            return null;
          }
        } catch {
          return null;
        }

        setStoredSubmissionReservation(currentReservationStorageKey, legacyReservation);
        clearStoredSubmissionReservation(legacyReservationStorageKey);
        return legacyReservation;
      };

      let activeReservation = getStoredSubmissionReservation(currentReservationStorageKey);
      if (!activeReservation) {
        activeReservation = await migrateLegacyReservation();
      }

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
      // Give the next block timestamp enough room to advance before submitQuestionWithMedia.
      await new Promise(resolve => setTimeout(resolve, 1_100));

      if (canUseSponsoredSubmitCalls) {
        const callsResult = await executeSponsoredCalls(
          [
            {
              abi: QUESTION_SUBMISSION_ABI,
              address: registryAddress,
              args: [
                submittedImageUrls,
                submittedVideoUrl,
                submittedTitle,
                submittedDescription,
                submissionTags,
                selectedCategory.id,
                activeReservation.salt,
              ],
              functionName: "submitQuestionWithMedia",
            },
          ],
          {
            atomicRequired: true,
            suppressStatusToast: true,
          },
        );

        contentId = extractSubmittedContentId((callsResult.receipts ?? []).flatMap(receipt => receipt.logs));
      } else {
        const submitTxHash = await writeContract(wagmiConfig, {
          address: registryAddress,
          abi: QUESTION_SUBMISSION_ABI,
          functionName: "submitQuestionWithMedia",
          args: [
            submittedImageUrls,
            submittedVideoUrl,
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

      statusToast.dismiss();
      notification.success("Question submitted! Staked 10 cREP.");
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
      setSubmitAttempted(false);
    } catch (e: unknown) {
      console.error("Submit failed:", e);
      statusToast.dismiss();
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
      statusToast.dismiss();
    }
  };

  const handleCloseShareModal = () => {
    setSubmittedContent(null);
  };

  const imageMediaMissing = submitAttempted && mediaMode === "images" && !normalizedImageUrls.some(isDirectImageUrl);
  const videoMediaMissing = submitAttempted && mediaMode === "video" && !normalizedVideoUrl;

  return (
    <>
      <div className="surface-card rounded-2xl p-6 space-y-5">
        <h1 className={surfaceSectionHeadingClassName}>Submit Question</h1>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,0.9fr)] xl:items-start"
        >
          <div className="space-y-5">
            <div>
              <label
                className={`mb-2 flex items-center gap-1.5 text-base font-medium ${
                  submitAttempted && !title.trim() ? "text-error" : ""
                }`}
              >
                Question
                <InfoTooltip text="Good questions are specific, subjective, and easy to compare. Focus on one clear thing voters can rate, avoid yes/no or factual prompts, and add context below." />
              </label>
              <input
                type="text"
                placeholder="Ask something subjective that voters can rate"
                className={`input input-bordered w-full bg-base-100 ${
                  titleError || (submitAttempted && !title.trim()) ? "input-error" : ""
                }`}
                value={title}
                onChange={e => handleTitleChange(e.target.value)}
                maxLength={MAX_QUESTION_LENGTH}
              />
              {submitAttempted && !title.trim() ? (
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
                className={`mb-2 block text-base font-medium ${submitAttempted && !description.trim() ? "text-error" : ""}`}
              >
                Description
              </label>
              <textarea
                placeholder="Add context voters should consider"
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
                    <p className="text-base text-error">Add at least one image URL before submitting.</p>
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
                    <p className="mt-1 text-base text-error">Add a YouTube URL before submitting.</p>
                  ) : null}
                </div>
              )}
            </div>

            <div ref={categoryDropdownRef} className="relative">
              <label
                className={`mb-2 block text-base font-medium ${submitAttempted && !selectedCategory ? "text-error" : ""}`}
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
                      submitAttempted && !selectedCategory ? "input-error" : ""
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
                  {submitAttempted && !selectedCategory ? (
                    <p className="mt-1 text-base text-error">Select a category before submitting.</p>
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
            {hasValidPreviewMedia || title || description ? (
              <div className="surface-card rounded-2xl p-4 space-y-3">
                <p className="text-base font-medium uppercase tracking-wider text-base-content/40">Preview</p>
                {title ? <h3 className="line-clamp-2 text-lg font-semibold text-base-content">{title}</h3> : null}
                <ContentEmbed
                  url={hasValidPreviewMedia ? previewMediaUrl : ""}
                  title={title}
                  description={description}
                  compact
                />
                {description && hasValidPreviewMedia ? (
                  <p className="text-base text-base-content/70">{description}</p>
                ) : null}
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
                  Add the question and media to preview how it will appear.
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
                    <InfoTooltip text="Projected cREP reward from the Bootstrap Pool, paid only when the submitter stake resolves on the healthy path after a settled round. Rate decreases as more cREP is distributed." />
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
              disabled={isSubmitting || isAwaitingSponsoredSubmitCalls || isMissingGasBalance}
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="loading loading-spinner loading-sm"></span>
                  Submitting...
                </span>
              ) : (
                "Submit Question"
              )}
            </button>
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
