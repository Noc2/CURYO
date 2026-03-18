"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { IdentificationIcon } from "@heroicons/react/24/outline";
import { ProfileImageLightbox } from "~~/components/shared/ProfileImageLightbox";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import {
  useAvatarAccent,
  useClearAvatarAccent,
  useIsNameTaken,
  useProfileRegistry,
  useSetAvatarAccent,
  useSetProfile,
} from "~~/hooks/useProfileRegistry";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { avatarAccentHexToRgb, normalizeAvatarAccentHex } from "~~/lib/avatar/avatarAccent";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";
import { getProxiedProfileImageUrl, getReputationAvatarUrl } from "~~/utils/profileImage";
import { notification } from "~~/utils/scaffold-eth";

// Validation regex: 3-20 alphanumeric + underscore
const NAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const MAX_STRATEGY_LENGTH = 560;
const DEFAULT_AVATAR_ACCENT_HEX = "#f26426";

export function ProfileForm() {
  const { address } = useAccount();
  const { hasVoterId, isLoading: voterIdLoading } = useVoterIdNFT(address);
  const { profile, hasProfile, isLoading: profileLoading, refetch } = useProfileRegistry(address);
  const { avatarAccent, isLoading: avatarAccentLoading, refetch: refetchAvatarAccent } = useAvatarAccent(address);
  const { setProfile, isPending } = useSetProfile();
  const { setAvatarAccent, isPending: avatarAccentPending } = useSetAvatarAccent();
  const { clearAvatarAccent, isPending: clearAvatarAccentPending } = useClearAvatarAccent();

  // Form state
  const [nameInput, setNameInput] = useState("");
  const [imageInput, setImageInput] = useState("");
  const [strategyInput, setStrategyInput] = useState("");
  const [avatarAccentInput, setAvatarAccentInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [accentError, setAccentError] = useState<string | null>(null);

  // Check name availability (debounced via query)
  const { isTaken: isNameTaken, isLoading: nameCheckLoading } = useIsNameTaken(nameInput);

  // Whether the name belongs to the current user (they can keep it)
  const isOwnName = hasProfile && profile?.name.toLowerCase() === nameInput.toLowerCase();

  // Initialize form once when profile first loads — avoid overwriting user edits on re-fetch
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (profile && hasProfile && !initialized) {
      setNameInput(profile.name);
      setImageInput(profile.imageUrl);
      setStrategyInput(profile.strategy);
      setInitialized(true);
    }
  }, [profile, hasProfile, initialized]);

  const [avatarAccentInitialized, setAvatarAccentInitialized] = useState(false);
  useEffect(() => {
    if (!address || avatarAccentLoading || avatarAccentInitialized) {
      return;
    }

    setAvatarAccentInput(avatarAccent?.hex ?? "");
    setAvatarAccentInitialized(true);
  }, [address, avatarAccent, avatarAccentInitialized, avatarAccentLoading]);

  useEffect(() => {
    setInitialized(false);
    setAvatarAccentInitialized(false);
    setNameInput("");
    setImageInput("");
    setStrategyInput("");
    setAvatarAccentInput("");
    setError(null);
    setAccentError(null);
  }, [address]);

  const handleSave = async () => {
    if (!address) return;
    const trimmedImageInput = imageInput.trim();
    const trimmedStrategy = strategyInput.trim();
    const sanitizedImageUrl = trimmedImageInput ? sanitizeExternalUrl(trimmedImageInput) : null;

    // Validate name
    if (!nameInput.trim()) {
      setError("Profile name is required");
      return;
    }

    if (!NAME_REGEX.test(nameInput)) {
      setError("Name must be 3-20 characters (letters, numbers, underscores)");
      return;
    }

    // Check if name is taken (unless it's the user's current name)
    if (isNameTaken && !isOwnName) {
      setError("This name is already taken");
      return;
    }

    // Validate image URL
    if (trimmedImageInput && !sanitizedImageUrl) {
      setError("Please enter a valid HTTPS URL for the image");
      return;
    }

    if (trimmedStrategy.length > MAX_STRATEGY_LENGTH) {
      setError(`How you rate must be ${MAX_STRATEGY_LENGTH} characters or fewer`);
      return;
    }

    setError(null);

    try {
      await setProfile(nameInput.trim(), sanitizedImageUrl ?? "", trimmedStrategy);
      notification.success(hasProfile ? "Profile updated!" : "Profile created!");
      refetch();
    } catch (e: any) {
      console.error("Profile update failed:", e);
      setError(e?.shortMessage || "Failed to update profile");
    }
  };

  const handleSaveAvatarAccent = async () => {
    if (!address) return;

    const normalizedAccentHex = normalizeAvatarAccentHex(avatarAccentInput);
    if (!normalizedAccentHex) {
      setAccentError("Enter a valid 6-digit hex color like #f26426");
      return;
    }

    const rgbValue = avatarAccentHexToRgb(normalizedAccentHex);
    if (rgbValue === null) {
      setAccentError("Enter a valid 6-digit hex color like #f26426");
      return;
    }

    setAccentError(null);

    try {
      await setAvatarAccent(rgbValue);
      setAvatarAccentInput(normalizedAccentHex);
      notification.success("Avatar color updated!");
      refetchAvatarAccent();
    } catch (e: any) {
      console.error("Avatar accent update failed:", e);
      setAccentError(e?.shortMessage || "Failed to update avatar color");
    }
  };

  const handleResetAvatarAccent = async () => {
    if (!address) return;

    if (!avatarAccent?.enabled) {
      setAvatarAccentInput("");
      setAccentError(null);
      return;
    }

    setAccentError(null);

    try {
      await clearAvatarAccent();
      setAvatarAccentInput("");
      notification.success("Avatar color reset!");
      refetchAvatarAccent();
    } catch (e: any) {
      console.error("Avatar accent reset failed:", e);
      setAccentError(e?.shortMessage || "Failed to reset avatar color");
    }
  };

  // Show name availability status
  const showNameStatus = nameInput.length >= 3 && !nameCheckLoading;
  const nameIsAvailable = showNameStatus && (!isNameTaken || isOwnName);
  const nameIsTaken = showNameStatus && isNameTaken && !isOwnName;
  const publicProfileHref = address ? `/profiles/${address.toLowerCase()}` : "/settings";
  const previewImageUrl = getProxiedProfileImageUrl(imageInput);
  const storedAvatarAccentHex = avatarAccent?.hex ?? null;
  const normalizedAvatarAccentInput = normalizeAvatarAccentHex(avatarAccentInput);
  const avatarAccentInputError = avatarAccentInput.trim().length > 0 && !normalizedAvatarAccentInput;
  const previewAvatarAccentHex = normalizedAvatarAccentInput ?? storedAvatarAccentHex;
  const fallbackImageUrl = getReputationAvatarUrl(address, 80, previewAvatarAccentHex) || "";
  const generatedAvatarPreviewUrl = getReputationAvatarUrl(address, 96, previewAvatarAccentHex) || "";
  const avatarAccentPickerValue = normalizedAvatarAccentInput ?? storedAvatarAccentHex ?? DEFAULT_AVATAR_ACCENT_HEX;
  const avatarAccentBusy = avatarAccentPending || clearAvatarAccentPending;
  const hasAvatarAccentChanges = normalizedAvatarAccentInput !== storedAvatarAccentHex;

  if (profileLoading || voterIdLoading || avatarAccentLoading) {
    return (
      <div className="surface-card rounded-2xl p-6">
        <div className="flex items-center justify-center py-8">
          <span className="loading loading-spinner loading-md"></span>
          <span className="ml-2 text-base-content/50">Loading profile...</span>
        </div>
      </div>
    );
  }

  // Require Voter ID to create/update profile
  if (!hasVoterId) {
    return (
      <div className="surface-card rounded-2xl p-6 space-y-4">
        <h1 className="text-2xl font-semibold">Create Profile</h1>

        <div className="bg-warning/10 border border-warning/20 rounded-xl p-6 text-center space-y-4">
          <IdentificationIcon className="w-12 h-12 text-warning mx-auto" />
          <h2 className="text-lg font-semibold">Voter ID Required</h2>
          <p className="text-base-content/70">
            You need a Voter ID to create a profile. Verify your identity with Self.xyz to receive your Voter ID.
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
    <div className="surface-card rounded-2xl p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-semibold">{hasProfile ? "Your Profile" : "Create Profile"}</h1>
        <Link href={publicProfileHref} className="btn btn-submit">
          Open public profile
        </Link>
      </div>

      {/* Avatar Preview */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <ProfileImageLightbox
            src={previewImageUrl || fallbackImageUrl}
            fallbackSrc={fallbackImageUrl}
            alt="Profile preview"
            width={80}
            height={80}
            triggerLabel="Open profile preview image"
            modalLabel="Profile image preview"
            buttonClassName="rounded-full"
            imageClassName="h-20 w-20 rounded-full border-2 border-base-300 object-cover"
            modalImageClassName="rounded-[2rem]"
          />
        </div>
        <div className="flex-1">
          <p className="text-base text-base-content/60 mb-1">Profile preview</p>
          <p className="text-xl font-semibold">{nameInput || "Your Name"}</p>
          <p className="text-base text-base-content/50 font-mono">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
          {strategyInput.trim() ? (
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-base-content/65">{strategyInput.trim()}</p>
          ) : null}
        </div>
      </div>

      {/* Name Input */}
      <div>
        <label className="flex items-center gap-1.5 text-base font-medium mb-2">
          Profile Name
          <InfoTooltip text="Letters, numbers, and underscores only (3-20 characters)" />
        </label>
        <input
          type="text"
          placeholder="Enter your name"
          className={`input input-bordered w-full bg-base-100 ${nameIsTaken ? "input-error" : nameIsAvailable ? "input-success" : ""}`}
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          maxLength={20}
          disabled={isPending}
        />
        <div className="flex justify-between mt-1">
          <div>
            {nameIsTaken && <p className="text-error text-base">This name is already taken</p>}
            {nameIsAvailable && <p className="text-success text-base">Name is available</p>}
            {!showNameStatus && nameInput.length > 0 && nameInput.length < 3 && (
              <p className="text-warning text-base">Name must be at least 3 characters</p>
            )}
          </div>
          <span className="text-base text-base-content/40">{nameInput.length}/20</span>
        </div>
      </div>

      {/* Image URL Input */}
      <div>
        <label className="flex items-center gap-1.5 text-base font-medium mb-2">
          Profile Image URL
          <InfoTooltip text="Leave empty to use your Curio reputation avatar" />
        </label>
        <input
          type="url"
          placeholder="https://example.com/your-image.jpg"
          className="input input-bordered w-full bg-base-100"
          value={imageInput}
          onChange={e => setImageInput(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="surface-card-nested rounded-2xl p-4 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-lg font-semibold">Reputation avatar color</h2>
              <InfoTooltip text="Choose one accent color for your generated Curyo avatar. The rest of the palette is derived automatically, and custom profile images still override the generated avatar across the app." />
            </div>
            <p className="text-sm leading-6 text-base-content/70">
              Personalize the generated avatar tied to your account without changing the overall Curyo visual style.
            </p>
          </div>

          <ProfileImageLightbox
            src={generatedAvatarPreviewUrl}
            fallbackSrc={generatedAvatarPreviewUrl}
            alt="Generated avatar preview"
            width={96}
            height={96}
            triggerLabel="Open generated avatar preview"
            modalLabel="Generated avatar preview"
            buttonClassName="rounded-full"
            imageClassName="h-24 w-24 rounded-full border-2 border-base-300 object-cover"
            modalImageClassName="rounded-[2rem]"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-[auto,1fr] sm:items-center">
          <label className="text-base font-medium">Accent color</label>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="color"
              aria-label="Avatar accent color picker"
              className="h-12 w-20 cursor-pointer rounded-xl border border-base-300 bg-base-100 p-1"
              value={avatarAccentPickerValue}
              onChange={e => {
                setAvatarAccentInput(e.target.value);
                setAccentError(null);
              }}
              disabled={avatarAccentBusy}
            />
            <input
              type="text"
              placeholder="#f26426"
              className={`input input-bordered w-full bg-base-100 sm:max-w-xs ${avatarAccentInputError ? "input-error" : ""}`}
              value={avatarAccentInput}
              onChange={e => {
                setAvatarAccentInput(e.target.value);
                setAccentError(null);
              }}
              disabled={avatarAccentBusy}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 text-sm text-base-content/65">
          <p>Used for your generated reputation avatar whenever you do not set a custom profile image.</p>
          {!avatarAccent?.enabled ? <p>Currently using the default address-based color palette.</p> : null}
          {avatarAccentInputError ? <p className="text-error">Use a valid 6-digit hex color like #f26426.</p> : null}
          {accentError ? <p className="text-error">{accentError}</p> : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleSaveAvatarAccent}
            className="btn btn-submit sm:flex-1"
            disabled={
              avatarAccentBusy || !normalizedAvatarAccentInput || avatarAccentInputError || !hasAvatarAccentChanges
            }
          >
            {avatarAccentPending ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm"></span>
                Saving color...
              </span>
            ) : (
              "Save avatar color"
            )}
          </button>
          <button
            type="button"
            onClick={handleResetAvatarAccent}
            className="btn btn-ghost border border-base-300 sm:w-auto"
            disabled={avatarAccentBusy || (!avatarAccent?.enabled && avatarAccentInput.trim().length === 0)}
          >
            {clearAvatarAccentPending ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm"></span>
                Resetting...
              </span>
            ) : (
              "Reset to default"
            )}
          </button>
        </div>
      </div>

      <div>
        <label className="flex items-center gap-1.5 text-base font-medium mb-2">
          How I rate on Curyo
          <InfoTooltip text="Share the signals you trust, where you have expertise, and what makes you vote up or down." />
        </label>
        <textarea
          placeholder="I rate highly when content is original, accurate, and useful beyond niche hype. I downvote misleading descriptions, broken links, and low-effort reposts."
          className="textarea textarea-bordered min-h-36 w-full bg-base-100"
          value={strategyInput}
          onChange={e => setStrategyInput(e.target.value)}
          maxLength={MAX_STRATEGY_LENGTH}
          disabled={isPending}
          rows={6}
        />
        <div className="mt-2 flex justify-end">
          <span className="text-sm text-base-content/40">
            {strategyInput.trim().length}/{MAX_STRATEGY_LENGTH}
          </span>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-error/10 rounded-lg p-4">
          <p className="text-error text-base">{error}</p>
        </div>
      )}

      {/* Info Box */}
      <div className="surface-card-nested rounded-2xl p-4">
        <p className="text-base text-base-content/75">
          Your profile is stored publicly on the blockchain. A small gas fee is required to{" "}
          {hasProfile ? "update" : "create"} your profile.
        </p>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSave}
        className="btn btn-submit w-full"
        disabled={isPending || !nameInput.trim() || nameIsTaken || strategyInput.trim().length > MAX_STRATEGY_LENGTH}
      >
        {isPending ? (
          <span className="flex items-center gap-2">
            <span className="loading loading-spinner loading-sm"></span>
            Saving...
          </span>
        ) : hasProfile ? (
          "Update Profile"
        ) : (
          "Create Profile"
        )}
      </button>

      {/* Last updated info */}
      {hasProfile && profile?.updatedAt && (
        <p className="text-base text-base-content/50 text-center">
          Last updated: {new Date(Number(profile.updatedAt) * 1000).toLocaleDateString()}
        </p>
      )}
    </div>
  );
}
