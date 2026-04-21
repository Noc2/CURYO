"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ROUND_STATE } from "@curyo/contracts/protocol";
import {
  type ExpertiseArea,
  type LanguageCode,
  PROFILE_SELF_REPORT_NOTICE,
  type ProfileRole,
  type ProfileSelfReport,
  normalizeProfileSelfReport,
  parseProfileSelfReport,
  profileSelfReportHasValues,
  serializeProfileSelfReport,
} from "@curyo/node-utils/profileSelfReport";
import { useAccount } from "wagmi";
import {
  ArrowLeftIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  LinkIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { BalanceHistory } from "~~/components/leaderboard/BalanceHistory";
import { CategoryBars } from "~~/components/leaderboard/CategoryBars";
import { StakeBreakdown } from "~~/components/leaderboard/StakeBreakdown";
import { WinRateRing } from "~~/components/leaderboard/WinRateRing";
import { FollowProfileButton } from "~~/components/shared/FollowProfileButton";
import { ProfileImageLightbox } from "~~/components/shared/ProfileImageLightbox";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { buildRateContentHref } from "~~/constants/routes";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { useCuryoConnectModal } from "~~/hooks/useCuryoConnectModal";
import { useFollowedProfiles } from "~~/hooks/useFollowedProfiles";
import { usePageVisibility } from "~~/hooks/usePageVisibility";
import { usePonderQuery } from "~~/hooks/usePonderQuery";
import {
  useAvatarAccent,
  useClearAvatarAccent,
  useIsNameTaken,
  useProfileRegistry,
  useSetAvatarAccent,
  useSetProfile,
} from "~~/hooks/useProfileRegistry";
import { formatReferralAmount, useReferralProgram } from "~~/hooks/useReferralProgram";
import { useVoterAccuracy } from "~~/hooks/useVoterAccuracy";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { useVoterStreak } from "~~/hooks/useVoterStreak";
import { avatarAccentHexToRgb, normalizeAvatarAccentHex } from "~~/lib/avatar/avatarAccent";
import { FOLLOWED_CURATOR_TOAST_ID } from "~~/lib/notifications/followedActivity";
import {
  PROFILE_AGE_GROUP_OPTIONS,
  PROFILE_COUNTRY_OPTIONS,
  PROFILE_EXPERTISE_OPTIONS,
  PROFILE_LANGUAGE_OPTIONS,
  PROFILE_ROLE_OPTIONS,
  getProfileSelfReportDisplayGroups,
} from "~~/lib/profile/profileSelfReportDisplay";
import { MAX_PROFILE_SELF_REPORT_LENGTH } from "~~/lib/profile/profileValidation";
import { AVATAR_WIN_RATE_TOOLTIP } from "~~/lib/profile/winRateTooltip";
import { formatRatingScoreOutOfTen } from "~~/lib/ui/ratingDisplay";
import { type PonderProfileDetailResponse, type PonderVoteItem, ponderApi } from "~~/services/ponder/client";
import { getReputationAvatarUrl } from "~~/utils/profileImage";
import { notification } from "~~/utils/scaffold-eth";

interface PublicProfileViewProps {
  address: `0x${string}`;
  embedded?: boolean;
}

const NAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const DEFAULT_AVATAR_ACCENT_HEX = "#f26426";

function truncateAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatCrepString(value: string | null | undefined) {
  if (!value) return "0";
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatTimestamp(timestamp: string) {
  return new Date(Number(timestamp) * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getUrlHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getVoteDirection(vote: PonderVoteItem) {
  if (vote.isUp === true) return { label: "Up", className: "text-success" };
  if (vote.isUp === false) return { label: "Down", className: "text-error" };
  return { label: "Hidden", className: "text-base-content/50" };
}

function getVoteOutcome(vote: PonderVoteItem) {
  if (vote.roundState === ROUND_STATE.Settled && vote.revealed && vote.isUp !== null && vote.roundUpWins !== null) {
    return vote.isUp === vote.roundUpWins
      ? { label: "Won", className: "text-success" }
      : { label: "Lost", className: "text-error" };
  }

  if (vote.roundState === ROUND_STATE.Cancelled) return { label: "Cancelled", className: "text-base-content/50" };
  if (vote.roundState === ROUND_STATE.Tied) return { label: "Tied", className: "text-warning" };
  if (vote.roundState === ROUND_STATE.RevealFailed) return { label: "Reveal failed", className: "text-warning" };
  if (!vote.revealed) return { label: "Voted hidden", className: "text-base-content/50" };
  return { label: "Open", className: "text-primary" };
}

function getProfileWriteErrorMessage(error: any, fallback: string) {
  return error?.shortMessage || error?.message || fallback;
}

function emptySelfReport() {
  return normalizeProfileSelfReport({});
}

function profileSelfReportFromString(value: string | null | undefined) {
  return parseProfileSelfReport(value) ?? emptySelfReport();
}

function getProfileSelfReportLength(value: ProfileSelfReport) {
  const normalized = normalizeProfileSelfReport(value);
  return profileSelfReportHasValues(normalized) ? serializeProfileSelfReport(normalized).length : 0;
}

function updateSelfReportArray<T extends string>(
  report: ProfileSelfReport,
  key: "expertise" | "languages" | "nationalities" | "roles",
  value: T,
  checked: boolean,
) {
  const current = new Set((report[key] ?? []) as string[]);
  if (checked) {
    current.add(value);
  } else {
    current.delete(value);
  }
  return normalizeProfileSelfReport({ ...report, [key]: Array.from(current) });
}

function optionSelected(values: readonly string[] | undefined, value: string) {
  return values?.includes(value) ?? false;
}

export function PublicProfileView({ address, embedded = false }: PublicProfileViewProps) {
  const normalizedAddress = address.toLowerCase() as `0x${string}`;
  const isPageVisible = usePageVisibility();
  const { targetNetwork } = useTargetNetwork();
  const { address: connectedAddress } = useAccount();
  const { openConnectModal } = useCuryoConnectModal();
  const {
    followedWallets,
    toggleFollow,
    isPending: isFollowPending,
  } = useFollowedProfiles(connectedAddress, {
    autoRead: false,
  });
  const { stats, categories } = useVoterAccuracy(normalizedAddress);
  const { hasVoterId, tokenId, isLoading: voterIdLoading } = useVoterIdNFT(normalizedAddress);
  const {
    profile: liveProfile,
    hasProfile: hasLiveProfile,
    isLoading: liveProfileLoading,
    refetch: refetchLiveProfile,
  } = useProfileRegistry(normalizedAddress);
  const {
    avatarAccent,
    isLoading: avatarAccentLoading,
    refetch: refetchAvatarAccent,
  } = useAvatarAccent(normalizedAddress);
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard();
  const { setProfile, isPending: isSavingProfile } = useSetProfile();
  const { setAvatarAccent, isPending: avatarAccentPending } = useSetAvatarAccent();
  const { clearAvatarAccent, isPending: clearAvatarAccentPending } = useClearAvatarAccent();
  const { claimantBonus, referralCount, referralLink, referralReward, totalEarned } =
    useReferralProgram(normalizedAddress);

  const { data: profileResult, isLoading: profileLoading } = usePonderQuery<
    PonderProfileDetailResponse,
    PonderProfileDetailResponse
  >({
    queryKey: ["publicProfile", normalizedAddress],
    ponderFn: async () => ponderApi.getProfile(normalizedAddress),
    rpcFn: async () => ({
      profile: null,
      summary: {
        totalVotes: 0,
        totalContent: 0,
        totalRewardsClaimed: "0",
      },
      recentVotes: [],
      recentRewards: [],
      recentSubmissions: [],
    }),
    enabled: true,
    staleTime: 30_000,
    refetchInterval: isPageVisible ? 60_000 : false,
  });

  const profileDetail = profileResult?.data ?? null;
  const summary = profileDetail?.profile ?? null;
  const dailyStreak = useVoterStreak(normalizedAddress);
  const recentVotes = profileDetail?.recentVotes ?? [];
  const recentSubmissions = profileDetail?.recentSubmissions ?? [];
  const ownProfile = connectedAddress?.toLowerCase() === normalizedAddress;
  const [isEditing, setIsEditing] = useState(false);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [selfReportInput, setSelfReportInput] = useState<ProfileSelfReport>(() => emptySelfReport());
  const [avatarAccentInput, setAvatarAccentInput] = useState("");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [accentError, setAccentError] = useState<string | null>(null);
  const [committedName, setCommittedName] = useState("");
  const [committedSelfReport, setCommittedSelfReport] = useState<ProfileSelfReport>(() => emptySelfReport());
  const [committedAvatarAccentHex, setCommittedAvatarAccentHex] = useState<string | null>(null);
  const [profileDraftInitialized, setProfileDraftInitialized] = useState(false);
  const [avatarAccentInitialized, setAvatarAccentInitialized] = useState(false);
  const following = followedWallets.has(normalizedAddress);
  const pending = isFollowPending(normalizedAddress);
  const backHref = ownProfile ? "/governance#profile" : "/governance";
  const totalVotes = profileDetail?.summary.totalVotes ?? 0;
  const ponderSelfReport = profileSelfReportFromString(summary?.selfReport);

  useEffect(() => {
    setIsEditing(false);
    setIsAvatarEditorOpen(false);
    setIsReferralModalOpen(false);
    setNameInput("");
    setSelfReportInput(emptySelfReport());
    setAvatarAccentInput("");
    setProfileError(null);
    setAccentError(null);
    setCommittedName("");
    setCommittedSelfReport(emptySelfReport());
    setCommittedAvatarAccentHex(null);
    setProfileDraftInitialized(false);
    setAvatarAccentInitialized(false);
  }, [normalizedAddress]);

  useEffect(() => {
    if (profileDraftInitialized || liveProfileLoading) {
      return;
    }

    const nextName = liveProfile?.name ?? "";
    const nextSelfReport = profileSelfReportFromString(liveProfile?.selfReport);
    setCommittedName(nextName);
    setCommittedSelfReport(nextSelfReport);
    setNameInput(nextName);
    setSelfReportInput(nextSelfReport);
    setProfileDraftInitialized(true);
  }, [liveProfile, liveProfileLoading, profileDraftInitialized]);

  useEffect(() => {
    if (!profileDraftInitialized || isEditing || liveProfileLoading) {
      return;
    }

    const nextName = liveProfile?.name ?? "";
    const nextSelfReport = profileSelfReportFromString(liveProfile?.selfReport);
    setCommittedName(nextName);
    setCommittedSelfReport(nextSelfReport);
    setNameInput(nextName);
    setSelfReportInput(nextSelfReport);
  }, [liveProfile, isEditing, liveProfileLoading, profileDraftInitialized]);

  useEffect(() => {
    if (avatarAccentInitialized || avatarAccentLoading) {
      return;
    }

    const nextAccentHex = avatarAccent?.hex ?? null;
    setCommittedAvatarAccentHex(nextAccentHex);
    setAvatarAccentInput(nextAccentHex ?? "");
    setAvatarAccentInitialized(true);
  }, [avatarAccent, avatarAccentInitialized, avatarAccentLoading]);

  useEffect(() => {
    if (!avatarAccentInitialized || isAvatarEditorOpen || avatarAccentLoading) {
      return;
    }

    const nextAccentHex = avatarAccent?.hex ?? null;
    setCommittedAvatarAccentHex(nextAccentHex);
    setAvatarAccentInput(nextAccentHex ?? "");
  }, [avatarAccent, avatarAccentInitialized, avatarAccentLoading, isAvatarEditorOpen]);

  const { isTaken: isNameTaken, isLoading: nameCheckLoading } = useIsNameTaken(nameInput);
  const currentName = ownProfile ? committedName || liveProfile?.name || summary?.name || "" : summary?.name || "";
  const currentSelfReport = ownProfile ? committedSelfReport : ponderSelfReport;
  const currentSelfReportGroups = getProfileSelfReportDisplayGroups(currentSelfReport);
  const hasCurrentSelfReport = currentSelfReportGroups.length > 0;
  const selfReportInputLength = getProfileSelfReportLength(selfReportInput);
  const displayName = currentName || truncateAddress(normalizedAddress);
  const displayAvatarAccentHex = ownProfile ? (committedAvatarAccentHex ?? avatarAccent?.hex ?? null) : null;
  const fallbackImageUrl =
    getReputationAvatarUrl(normalizedAddress, 96, displayAvatarAccentHex, targetNetwork.id) || "";
  const isOwnName = currentName.length > 0 && currentName.toLowerCase() === nameInput.toLowerCase();
  const showNameStatus = isEditing && nameInput.length >= 3 && !nameCheckLoading;
  const nameIsAvailable = showNameStatus && (!isNameTaken || isOwnName);
  const nameIsUnavailable = showNameStatus && isNameTaken && !isOwnName;
  const normalizedAvatarAccentInput = normalizeAvatarAccentHex(avatarAccentInput);
  const avatarAccentInputError = avatarAccentInput.trim().length > 0 && !normalizedAvatarAccentInput;
  const previewAvatarAccentHex = normalizedAvatarAccentInput ?? committedAvatarAccentHex;
  const avatarAccentPickerValue = normalizedAvatarAccentInput ?? committedAvatarAccentHex ?? DEFAULT_AVATAR_ACCENT_HEX;
  const generatedAvatarPreviewUrl =
    getReputationAvatarUrl(normalizedAddress, 160, previewAvatarAccentHex, targetNetwork.id) || "";
  const generatedAvatarPreviewSrc = generatedAvatarPreviewUrl
    ? `${generatedAvatarPreviewUrl}&preview=${encodeURIComponent(previewAvatarAccentHex ?? "default")}`
    : "";
  const avatarAccentBusy = avatarAccentPending || clearAvatarAccentPending;
  const hasAvatarAccentChanges = normalizedAvatarAccentInput !== committedAvatarAccentHex;
  const referralCountLabel = Number(referralCount).toLocaleString();
  const referralTweetText = `Join Curyo, claim cREP, and get verified. Use my referral link so we both receive a cREP bonus: ${referralLink}`;
  const winRateLabel = stats && stats.totalSettledVotes > 0 ? `${(stats.winRate * 100).toFixed(1)}%` : "—";
  const dailyStreakLabel = (dailyStreak?.currentDailyStreak ?? 0).toLocaleString();
  const resolvedVotesLabel = (stats?.totalSettledVotes ?? 0).toLocaleString();

  const streakLabel = useMemo(() => {
    if (!stats) return "0";
    if (stats.currentStreak > 0) return `${stats.currentStreak}W`;
    if (stats.currentStreak < 0) return `${Math.abs(stats.currentStreak)}L`;
    return "0";
  }, [stats]);

  const handleToggleFollow = useCallback(async () => {
    const result = await toggleFollow(normalizedAddress);

    if (!result.ok) {
      if (result.reason === "not_connected") {
        notification.info("Sign in to follow curators.", { id: FOLLOWED_CURATOR_TOAST_ID });
        void openConnectModal();
        return;
      }

      if (result.reason === "self_follow" || result.reason === "rejected") {
        return;
      }

      notification.error(result.error || "Failed to update follows", { id: FOLLOWED_CURATOR_TOAST_ID });
      return;
    }

    notification.success(result.following ? `Following ${displayName}` : `Unfollowed ${displayName}`, {
      id: FOLLOWED_CURATOR_TOAST_ID,
    });
  }, [displayName, normalizedAddress, openConnectModal, toggleFollow]);

  const openEditMode = useCallback(() => {
    setNameInput(currentName);
    setSelfReportInput(currentSelfReport);
    setProfileError(null);
    setIsEditing(true);
  }, [currentName, currentSelfReport]);

  const handleCancelEdit = useCallback(() => {
    setNameInput(currentName);
    setSelfReportInput(currentSelfReport);
    setProfileError(null);
    setIsEditing(false);
  }, [currentName, currentSelfReport]);

  const handleSaveProfile = useCallback(async () => {
    if (!hasVoterId) {
      notification.info("Get a Voter ID before creating a profile.");
      return;
    }

    const trimmedName = nameInput.trim();
    let serializedSelfReport: string;
    let normalizedSelfReport: ProfileSelfReport;

    if (!trimmedName) {
      setProfileError("Profile name is required");
      return;
    }

    if (!NAME_REGEX.test(trimmedName)) {
      setProfileError("Name must be 3-20 characters (letters, numbers, underscores)");
      return;
    }

    if (isNameTaken && !isOwnName) {
      setProfileError("This name is already taken");
      return;
    }

    try {
      normalizedSelfReport = normalizeProfileSelfReport(selfReportInput);
      serializedSelfReport = profileSelfReportHasValues(normalizedSelfReport)
        ? serializeProfileSelfReport(normalizedSelfReport)
        : "";
    } catch (error: any) {
      setProfileError(error?.message || "Self-reported context is too large");
      return;
    }

    if (serializedSelfReport.length > MAX_PROFILE_SELF_REPORT_LENGTH) {
      setProfileError(`Self-reported context must be ${MAX_PROFILE_SELF_REPORT_LENGTH} characters or fewer`);
      return;
    }

    setProfileError(null);

    try {
      await setProfile(trimmedName, serializedSelfReport);
      setCommittedName(trimmedName);
      setCommittedSelfReport(normalizedSelfReport);
      setNameInput(trimmedName);
      setSelfReportInput(normalizedSelfReport);
      setIsEditing(false);
      notification.success(hasLiveProfile ? "Profile updated!" : "Profile created!");
      refetchLiveProfile();
    } catch (error: any) {
      console.error("Profile update failed:", error);
      setProfileError(getProfileWriteErrorMessage(error, "Failed to update profile"));
    }
  }, [hasLiveProfile, hasVoterId, isNameTaken, isOwnName, nameInput, refetchLiveProfile, selfReportInput, setProfile]);

  const openAvatarEditor = useCallback(() => {
    if (!hasVoterId) {
      notification.info("Get a Voter ID before editing your avatar.");
      return;
    }

    setAvatarAccentInput(committedAvatarAccentHex ?? "");
    setAccentError(null);
    setIsAvatarEditorOpen(true);
  }, [committedAvatarAccentHex, hasVoterId]);

  const closeAvatarEditor = useCallback(() => {
    setAvatarAccentInput(committedAvatarAccentHex ?? "");
    setAccentError(null);
    setIsAvatarEditorOpen(false);
  }, [committedAvatarAccentHex]);

  const openReferralModal = useCallback(() => {
    if (!hasVoterId) {
      notification.info("Get a Voter ID before using referrals.");
      return;
    }

    setIsReferralModalOpen(true);
  }, [hasVoterId]);

  const closeReferralModal = useCallback(() => {
    setIsReferralModalOpen(false);
  }, []);

  const handleCopyReferralLink = useCallback(() => {
    if (!referralLink) return;
    copyToClipboard(referralLink);
  }, [copyToClipboard, referralLink]);

  const handleSaveAvatarAccent = useCallback(async () => {
    const normalizedAccentHex = normalizeAvatarAccentHex(avatarAccentInput);
    if (!normalizedAccentHex) {
      setAccentError("Use a valid 6-digit hex color like #f26426.");
      return;
    }

    const rgbValue = avatarAccentHexToRgb(normalizedAccentHex);
    if (rgbValue === null) {
      setAccentError("Use a valid 6-digit hex color like #f26426.");
      return;
    }

    setAccentError(null);

    try {
      await setAvatarAccent(rgbValue);
      setCommittedAvatarAccentHex(normalizedAccentHex);
      setAvatarAccentInput(normalizedAccentHex);
      setIsAvatarEditorOpen(false);
      notification.success("Avatar color updated!");
      refetchAvatarAccent();
    } catch (error: any) {
      console.error("Avatar accent update failed:", error);
      setAccentError(getProfileWriteErrorMessage(error, "Failed to update avatar color"));
    }
  }, [avatarAccentInput, refetchAvatarAccent, setAvatarAccent]);

  const handleResetAvatarAccent = useCallback(async () => {
    if (!committedAvatarAccentHex) {
      setAvatarAccentInput("");
      setAccentError(null);
      setIsAvatarEditorOpen(false);
      return;
    }

    setAccentError(null);

    try {
      await clearAvatarAccent();
      setCommittedAvatarAccentHex(null);
      setAvatarAccentInput("");
      setIsAvatarEditorOpen(false);
      notification.success("Avatar color reset!");
      refetchAvatarAccent();
    } catch (error: any) {
      console.error("Avatar accent reset failed:", error);
      setAccentError(getProfileWriteErrorMessage(error, "Failed to reset avatar color"));
    }
  }, [clearAvatarAccent, committedAvatarAccentHex, refetchAvatarAccent]);

  return (
    <div className={embedded ? "w-full space-y-6" : "flex flex-col items-center grow px-4 pt-8 pb-12"}>
      <div className={embedded ? "w-full space-y-6" : "w-full max-w-5xl space-y-6"}>
        {!embedded ? (
          <Link
            href={backHref}
            className="inline-flex items-center gap-2 rounded-full bg-base-200 px-3 py-1.5 text-base font-medium text-white transition-colors hover:bg-base-300"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back
          </Link>
        ) : null}

        <div className="surface-card rounded-3xl p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-4 min-w-0">
              {ownProfile ? (
                <button
                  type="button"
                  onClick={openAvatarEditor}
                  aria-label="Edit profile avatar"
                  className="group relative shrink-0 rounded-3xl transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  <img
                    src={fallbackImageUrl}
                    width={96}
                    height={96}
                    alt={`${displayName} avatar`}
                    className="h-24 w-24 rounded-3xl object-cover shrink-0"
                  />
                  <span className="absolute -bottom-1 -right-1 rounded-full bg-base-200 px-2 py-0.5 text-xs font-medium text-white transition-colors group-hover:bg-base-300">
                    Edit
                  </span>
                </button>
              ) : (
                <ProfileImageLightbox
                  src={fallbackImageUrl}
                  fallbackSrc={fallbackImageUrl}
                  alt={`${displayName} avatar`}
                  width={96}
                  height={96}
                  triggerLabel="Open profile avatar"
                  modalLabel={`${displayName} profile avatar`}
                  buttonClassName="shrink-0 rounded-3xl"
                  imageClassName="h-24 w-24 rounded-3xl object-cover shrink-0"
                  modalImageClassName="rounded-[2rem]"
                />
              )}
              <div className="min-w-0 flex-1">
                {ownProfile && isEditing ? (
                  <>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={event => {
                        setNameInput(event.target.value);
                        setProfileError(null);
                      }}
                      maxLength={20}
                      aria-label="Profile name"
                      placeholder="Profile name"
                      className={`input input-bordered h-auto w-full bg-base-100 px-0 text-3xl font-semibold ${
                        nameIsUnavailable ? "input-error" : ""
                      }`}
                      disabled={isSavingProfile}
                    />
                    <div className="mt-2 font-mono text-base text-base-content/55 break-all">{normalizedAddress}</div>
                    <div className="mt-2 flex items-start justify-between gap-3 text-sm">
                      <div className="text-base-content/55">
                        {nameIsUnavailable ? <p className="text-error">Name is already taken</p> : null}
                        {!showNameStatus && nameInput.length > 0 && nameInput.length < 3 ? (
                          <p className="text-warning">Min 3 characters</p>
                        ) : null}
                        {nameIsAvailable && !isOwnName ? <p className="text-success">Name is available</p> : null}
                      </div>
                      <span className="shrink-0 text-base-content/40">{nameInput.length}/20</span>
                    </div>
                  </>
                ) : (
                  <>
                    <h1 className="truncate text-3xl font-semibold">{displayName}</h1>
                    <div className="mt-2 font-mono text-base text-base-content/55 break-all">{normalizedAddress}</div>
                  </>
                )}
              </div>
            </div>

            {ownProfile ? (
              !hasVoterId ? (
                <Link
                  href="/governance#faucet"
                  className="inline-flex items-center justify-center rounded-full bg-base-200 px-4 py-2 text-base font-medium text-white transition-colors hover:bg-base-300"
                >
                  Get Voter ID
                </Link>
              ) : isEditing ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="btn btn-ghost border border-base-300"
                    disabled={isSavingProfile}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveProfile()}
                    className="btn btn-submit"
                    disabled={
                      isSavingProfile ||
                      !nameInput.trim() ||
                      nameIsUnavailable ||
                      selfReportInputLength > MAX_PROFILE_SELF_REPORT_LENGTH
                    }
                  >
                    {isSavingProfile ? "Saving..." : hasLiveProfile ? "Save changes" : "Save profile"}
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={openEditMode} className="btn btn-submit">
                    Edit profile
                  </button>
                  {hasVoterId ? (
                    <button
                      type="button"
                      onClick={openReferralModal}
                      className="btn border-none bg-error text-primary-content hover:bg-error/90"
                    >
                      Referrals
                    </button>
                  ) : null}
                </div>
              )
            ) : (
              <FollowProfileButton
                following={following}
                pending={pending}
                onClick={() => {
                  void handleToggleFollow();
                }}
                variant="pill"
              />
            )}
          </div>

          {!isEditing ? (
            <div className="mt-4 flex flex-col gap-2 text-base text-base-content/55 lg:flex-row lg:items-center">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="inline-flex items-center gap-1.5">
                  <span>
                    Win rate <span className="font-mono tabular-nums text-base-content/75">{winRateLabel}</span>
                  </span>
                  <InfoTooltip text={AVATAR_WIN_RATE_TOOLTIP} position="bottom" />
                </span>
                <span className="text-base-content/35">&bull;</span>
                <span>Daily Streak {dailyStreakLabel}</span>
                <span className="text-base-content/35">&bull;</span>
                <span>{profileLoading ? "..." : `${totalVotes} votes`}</span>
                <span className="text-base-content/35">&bull;</span>
                <span>{resolvedVotesLabel} resolved</span>
                <span className="text-base-content/35">&bull;</span>
                <span>
                  {voterIdLoading
                    ? "Loading Voter ID..."
                    : hasVoterId
                      ? `Voter ID #${tokenId.toString()}`
                      : "No Voter ID"}
                </span>
              </div>
              <div className="font-medium text-base-content/65 lg:ml-auto">
                Referrals <span className="font-mono tabular-nums text-base-content/85">{referralCountLabel}</span>
              </div>
            </div>
          ) : null}

          {profileError ? (
            <div className="mt-4 rounded-2xl bg-error/10 px-4 py-3 text-base text-error">{profileError}</div>
          ) : null}

          {ownProfile && isEditing ? (
            <div className="mt-6 rounded-2xl bg-base-content/[0.04] px-5 py-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">
                    Audience context
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-base-content/55">
                    {PROFILE_SELF_REPORT_NOTICE} AI tools and public readers may use it as context.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm border border-base-300"
                  onClick={() => {
                    setSelfReportInput(emptySelfReport());
                    setProfileError(null);
                  }}
                  disabled={isSavingProfile || !profileSelfReportHasValues(selfReportInput)}
                >
                  Clear
                </button>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <label className="form-control">
                  <span className="label-text text-base-content/65">Age group</span>
                  <select
                    aria-label="Age group"
                    className="select select-bordered mt-2 w-full bg-base-100"
                    value={selfReportInput.ageGroup ?? ""}
                    onChange={event => {
                      setSelfReportInput(
                        normalizeProfileSelfReport({ ...selfReportInput, ageGroup: event.target.value || undefined }),
                      );
                      setProfileError(null);
                    }}
                    disabled={isSavingProfile}
                  >
                    <option value="">Prefer not to say</option>
                    {PROFILE_AGE_GROUP_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-control">
                  <span className="label-text text-base-content/65">Country</span>
                  <select
                    aria-label="Country"
                    className="select select-bordered mt-2 w-full bg-base-100"
                    value={selfReportInput.residenceCountry ?? ""}
                    onChange={event => {
                      setSelfReportInput(
                        normalizeProfileSelfReport({
                          ...selfReportInput,
                          residenceCountry: event.target.value || undefined,
                        }),
                      );
                      setProfileError(null);
                    }}
                    disabled={isSavingProfile}
                  >
                    <option value="">Prefer not to say</option>
                    {PROFILE_COUNTRY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="form-control lg:col-span-2">
                  <span className="label-text text-base-content/65">Nationalities</span>
                  <select
                    multiple
                    size={5}
                    aria-label="Nationalities"
                    className="select select-bordered mt-2 h-36 w-full bg-base-100"
                    value={selfReportInput.nationalities ?? []}
                    onChange={event => {
                      const values = Array.from(event.currentTarget.selectedOptions).map(option => option.value);
                      setSelfReportInput(normalizeProfileSelfReport({ ...selfReportInput, nationalities: values }));
                      setProfileError(null);
                    }}
                    disabled={isSavingProfile}
                  >
                    {PROFILE_COUNTRY_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="lg:col-span-2">
                  <div className="label-text text-base-content/65">Languages</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {PROFILE_LANGUAGE_OPTIONS.map(option => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-base-content/75">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={optionSelected(selfReportInput.languages, option.value)}
                          onChange={event => {
                            setSelfReportInput(
                              updateSelfReportArray<LanguageCode>(
                                selfReportInput,
                                "languages",
                                option.value,
                                event.target.checked,
                              ),
                            );
                            setProfileError(null);
                          }}
                          disabled={isSavingProfile}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="label-text text-base-content/65">Roles</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {PROFILE_ROLE_OPTIONS.map(option => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-base-content/75">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={optionSelected(selfReportInput.roles, option.value)}
                          onChange={event => {
                            setSelfReportInput(
                              updateSelfReportArray<ProfileRole>(
                                selfReportInput,
                                "roles",
                                option.value,
                                event.target.checked,
                              ),
                            );
                            setProfileError(null);
                          }}
                          disabled={isSavingProfile}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="label-text text-base-content/65">Experience</div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {PROFILE_EXPERTISE_OPTIONS.map(option => (
                      <label key={option.value} className="flex items-center gap-2 text-sm text-base-content/75">
                        <input
                          type="checkbox"
                          className="checkbox checkbox-sm"
                          checked={optionSelected(selfReportInput.expertise, option.value)}
                          onChange={event => {
                            setSelfReportInput(
                              updateSelfReportArray<ExpertiseArea>(
                                selfReportInput,
                                "expertise",
                                option.value,
                                event.target.checked,
                              ),
                            );
                            setProfileError(null);
                          }}
                          disabled={isSavingProfile}
                        />
                        <span>{option.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <span className="text-sm text-base-content/40">
                  {selfReportInputLength}/{MAX_PROFILE_SELF_REPORT_LENGTH}
                </span>
              </div>
            </div>
          ) : hasCurrentSelfReport ? (
            <div className="mt-6 rounded-2xl bg-base-content/[0.04] px-5 py-4">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">Audience context</div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-base-content/55">{PROFILE_SELF_REPORT_NOTICE}</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {currentSelfReportGroups.map(group => (
                  <div key={group.label} className="rounded-2xl bg-base-content/[0.04] px-4 py-3">
                    <div className="text-sm font-medium text-base-content/50">{group.label}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {group.values.map(value => (
                        <span
                          key={value}
                          className="rounded-full bg-base-content/[0.07] px-3 py-1 text-sm text-base-content/75"
                        >
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : ownProfile ? (
            <div className="mt-6 rounded-2xl border border-dashed border-base-content/15 px-5 py-4">
              <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary/80">Audience context</div>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-base-content/55">{PROFILE_SELF_REPORT_NOTICE}</p>
              {!hasVoterId ? (
                <Link
                  href="/governance#faucet"
                  className="mt-4 inline-flex items-center justify-center rounded-full bg-base-content/[0.06] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-base-content/[0.1]"
                >
                  Get Voter ID
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {ownProfile ? (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,1fr)]">
            <BalanceHistory address={normalizedAddress} />
            <StakeBreakdown address={normalizedAddress} showEmpty />
          </div>
        ) : null}

        <div className="surface-card rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium text-base-content/60">Voting performance</span>
              <InfoTooltip text="Resolved rounds only. Category bars show win and loss ratios by category." />
            </div>
            <span className="text-base tabular-nums text-base-content/60">{resolvedVotesLabel} resolved</span>
          </div>

          {stats ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
                <WinRateRing winRate={stats.winRate} wins={stats.totalWins} losses={stats.totalLosses} />

                <div className="flex flex-1 flex-col gap-3">
                  <div className="flex flex-wrap gap-2">
                    <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base">
                      <span className="text-base-content/50">Current streak </span>
                      <span className="font-mono tabular-nums">{streakLabel}</span>
                    </div>
                    <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base">
                      <span className="text-base-content/50">Best streak </span>
                      <span className="font-mono tabular-nums">{stats.bestWinStreak}W</span>
                    </div>
                    <div className="rounded-full bg-base-content/[0.06] px-3 py-1.5 text-base">
                      <span className="text-base-content/50">Win rate </span>
                      <span className="font-mono tabular-nums">{(stats.winRate * 100).toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-base-content/[0.05] px-4 py-3">
                      <div className="text-base text-base-content/45">Stake won</div>
                      <div className="mt-1 text-xl font-semibold text-success">
                        {formatCrepString(stats.totalStakeWon)} cREP
                      </div>
                    </div>
                    <div className="rounded-2xl bg-base-content/[0.05] px-4 py-3">
                      <div className="text-base text-base-content/45">Stake lost</div>
                      <div className="mt-1 text-xl font-semibold text-error">
                        {formatCrepString(stats.totalStakeLost)} cREP
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <CategoryBars categories={categories} />
            </div>
          ) : (
            <div className="rounded-2xl bg-base-content/[0.04] px-4 py-8 text-center text-base text-base-content/55">
              No resolved voting history yet.
            </div>
          )}
        </div>

        <div className="surface-card rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium text-base-content/60">Recent questions</span>
              <InfoTooltip text="Latest questions this curator has asked. This is the clearest payoff from following them." />
            </div>
            <span className="text-base tabular-nums text-base-content/45">
              {profileLoading ? "..." : recentSubmissions.length}
            </span>
          </div>

          {profileLoading && recentSubmissions.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <span className="loading loading-spinner loading-sm"></span>
            </div>
          ) : recentSubmissions.length === 0 ? (
            <div className="rounded-2xl bg-base-content/[0.04] px-4 py-8 text-center text-base text-base-content/55">
              No questions yet.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {recentSubmissions.map(submission => {
                const categoryName = submission.categoryName || `Category #${submission.categoryId}`;
                const ratingScore = formatRatingScoreOutOfTen(submission.rating);
                return (
                  <Link
                    key={submission.id}
                    href={buildRateContentHref(submission.id)}
                    className="rounded-2xl border border-base-content/10 bg-base-content/[0.03] p-4 transition-colors hover:bg-base-content/[0.05]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold uppercase tracking-wide text-primary/80">
                          {categoryName}
                        </div>
                        <div className="mt-1 line-clamp-2 text-lg font-semibold leading-7">{submission.title}</div>
                        <p className="mt-1 line-clamp-2 text-sm text-base-content/65">{submission.description}</p>
                      </div>
                      <div className="rounded-full bg-base-content/[0.06] px-2.5 py-1 text-sm font-mono text-base-content/70">
                        <span className="font-semibold tabular-nums text-base-content/85">{ratingScore}</span>
                        <span className="font-medium text-base-content/50">/10</span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-sm text-base-content/55">
                      <span>{getUrlHost(submission.url)}</span>
                      <span>&bull;</span>
                      <span>{submission.totalVotes} votes</span>
                      <span>&bull;</span>
                      <span>{formatTimestamp(submission.createdAt)}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        <div className="surface-card rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-base font-medium text-base-content/60">Recent votes</span>
              <InfoTooltip text="Latest 20 vote commits for this wallet. Outcomes appear once rounds settle." />
            </div>
            <span className="text-base tabular-nums text-base-content/45">
              {profileLoading ? "..." : recentVotes.length}
            </span>
          </div>

          {profileLoading && recentVotes.length === 0 ? (
            <div className="flex items-center justify-center py-10">
              <span className="loading loading-spinner loading-sm"></span>
            </div>
          ) : recentVotes.length === 0 ? (
            <div className="rounded-2xl bg-base-content/[0.04] px-4 py-8 text-center text-base text-base-content/55">
              No recent votes yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr className="text-base-content/60">
                    <th>Content</th>
                    <th>Vote</th>
                    <th>Status</th>
                    <th className="text-right">Stake</th>
                    <th className="text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentVotes.map(vote => {
                    const direction = getVoteDirection(vote);
                    const outcome = getVoteOutcome(vote);

                    return (
                      <tr key={vote.id} className="hover:bg-base-200/40">
                        <td>
                          <Link
                            href={buildRateContentHref(vote.contentId)}
                            className="font-medium transition-colors hover:text-primary"
                          >
                            Content #{vote.contentId}
                          </Link>
                          <div className="text-base text-base-content/45">Round #{vote.roundId}</div>
                        </td>
                        <td>
                          <span className={`font-medium ${direction.className}`}>{direction.label}</span>
                        </td>
                        <td>
                          <span className={`font-medium ${outcome.className}`}>{outcome.label}</span>
                        </td>
                        <td className="text-right font-mono">{formatCrepString(vote.stake)} cREP</td>
                        <td className="text-right text-base-content/55">{formatTimestamp(vote.committedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {ownProfile && isAvatarEditorOpen ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Edit avatar color"
            onClick={closeAvatarEditor}
          >
            <div
              className="w-full max-w-xl rounded-3xl bg-base-200 p-6 shadow-2xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold">Edit avatar color</h2>
                  <p className="mt-1 text-base text-base-content/60">Choose one accent color for your public avatar.</p>
                </div>
                <button
                  type="button"
                  onClick={closeAvatarEditor}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-base-300 text-base-content transition-colors hover:bg-base-300/80"
                  aria-label="Close avatar editor"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-6 flex justify-center">
                <img
                  key={generatedAvatarPreviewSrc}
                  src={generatedAvatarPreviewSrc}
                  width={160}
                  height={160}
                  alt="Avatar preview"
                  className="h-40 w-40 rounded-[2rem] object-cover"
                />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-[auto,minmax(0,1fr)] sm:items-center">
                <input
                  type="color"
                  aria-label="Avatar accent color picker"
                  className="h-12 w-20 cursor-pointer rounded-xl border border-base-300 bg-base-100 p-1"
                  value={avatarAccentPickerValue}
                  onChange={event => {
                    setAvatarAccentInput(event.target.value);
                    setAccentError(null);
                  }}
                  disabled={avatarAccentBusy}
                />
                <input
                  type="text"
                  aria-label="Avatar accent hex"
                  placeholder="#f26426"
                  className={`input input-bordered w-full bg-base-100 ${avatarAccentInputError ? "input-error" : ""}`}
                  value={avatarAccentInput}
                  onChange={event => {
                    setAvatarAccentInput(event.target.value);
                    setAccentError(null);
                  }}
                  disabled={avatarAccentBusy}
                />
              </div>

              <div className="mt-3 min-h-6 text-sm">
                {avatarAccentInputError ? (
                  <p className="text-error">Use a valid 6-digit hex color like #f26426.</p>
                ) : accentError ? (
                  <p className="text-error">{accentError}</p>
                ) : null}
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void handleSaveAvatarAccent()}
                  className="btn btn-submit sm:flex-1"
                  disabled={
                    avatarAccentBusy ||
                    !normalizedAvatarAccentInput ||
                    avatarAccentInputError ||
                    !hasAvatarAccentChanges
                  }
                >
                  {avatarAccentPending ? "Saving..." : "Save color"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetAvatarAccent()}
                  className="btn btn-ghost border border-base-300 sm:w-auto"
                  disabled={avatarAccentBusy || (!committedAvatarAccentHex && avatarAccentInput.trim().length === 0)}
                >
                  {clearAvatarAccentPending ? "Resetting..." : "Reset"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {ownProfile && isReferralModalOpen ? (
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="Referrals"
            onClick={closeReferralModal}
          >
            <div
              className="w-full max-w-2xl rounded-3xl bg-base-200 p-6 shadow-2xl"
              onClick={event => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <UserGroupIcon className="h-6 w-6 text-primary" />
                  <h2 className="text-2xl font-semibold">Referrals</h2>
                </div>
                <button
                  type="button"
                  onClick={closeReferralModal}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-base-300 text-base-content transition-colors hover:bg-base-300/80"
                  aria-label="Close referrals"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-base-content/[0.04] px-5 py-4">
                  <div className="text-base text-base-content/45">Successful referrals</div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">{referralCountLabel}</div>
                </div>
                <div className="rounded-2xl bg-base-content/[0.04] px-5 py-4">
                  <div className="text-base text-base-content/45">Total received</div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums text-primary">
                    {formatReferralAmount(totalEarned)} cREP
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-primary/10 px-5 py-4">
                <div className="text-lg font-semibold">Referral tokens</div>
                <div className="mt-2 text-base text-base-content/70">
                  You get{" "}
                  <span className="font-semibold text-primary">{formatReferralAmount(referralReward)} cREP</span> per
                  referral
                </div>
                <div className="text-base text-base-content/70">
                  Friend gets{" "}
                  <span className="font-semibold text-primary">{formatReferralAmount(claimantBonus)} cREP</span> bonus
                </div>
              </div>

              <div className="mt-6">
                <div className="text-base font-medium">Referral link</div>
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={referralLink}
                    readOnly
                    className="input input-bordered flex-1 bg-base-100 font-mono text-base"
                  />
                  <button
                    type="button"
                    onClick={handleCopyReferralLink}
                    className="btn btn-submit btn-square"
                    title="Copy referral link"
                  >
                    {isCopiedToClipboard ? (
                      <CheckIcon className="h-5 w-5" />
                    ) : (
                      <ClipboardDocumentIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(referralTweetText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-submit sm:flex-1"
                >
                  Share on X
                </a>
                <button type="button" onClick={handleCopyReferralLink} className="btn btn-submit sm:flex-1 gap-2">
                  <LinkIcon className="h-5 w-5" />
                  {isCopiedToClipboard ? "Copied!" : "Copy link"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
