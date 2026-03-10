"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { blo } from "blo";
import { useAccount } from "wagmi";
import { IdentificationIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useIsNameTaken, useProfileRegistry, useSetProfile } from "~~/hooks/useProfileRegistry";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";
import { getProxiedProfileImageUrl } from "~~/utils/profileImage";
import { notification } from "~~/utils/scaffold-eth";

// Validation regex: 3-20 alphanumeric + underscore
const NAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export function ProfileForm() {
  const { address } = useAccount();
  const { hasVoterId, isLoading: voterIdLoading } = useVoterIdNFT(address);
  const { profile, hasProfile, isLoading: profileLoading, refetch } = useProfileRegistry(address);
  const { setProfile, isPending } = useSetProfile();

  // Form state
  const [nameInput, setNameInput] = useState("");
  const [imageInput, setImageInput] = useState("");
  const [error, setError] = useState<string | null>(null);

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
      setInitialized(true);
    }
  }, [profile, hasProfile, initialized]);

  const handleSave = async () => {
    if (!address) return;
    const trimmedImageInput = imageInput.trim();
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

    setError(null);

    try {
      await setProfile(nameInput.trim(), sanitizedImageUrl ?? "");
      notification.success(hasProfile ? "Profile updated!" : "Profile created!");
      refetch();
    } catch (e: any) {
      console.error("Profile update failed:", e);
      setError(e?.shortMessage || "Failed to update profile");
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (address) {
      e.currentTarget.src = blo(address as `0x${string}`);
    }
  };

  // Show name availability status
  const showNameStatus = nameInput.length >= 3 && !nameCheckLoading;
  const nameIsAvailable = showNameStatus && (!isNameTaken || isOwnName);
  const nameIsTaken = showNameStatus && isNameTaken && !isOwnName;
  const publicProfileHref = address ? `/profiles/${address.toLowerCase()}` : "/governance#profile";
  const previewImageUrl = getProxiedProfileImageUrl(imageInput);

  if (profileLoading || voterIdLoading) {
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
          <Link href="/governance" className="btn btn-curyo">
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
        <Link
          href={publicProfileHref}
          className="inline-flex items-center justify-center rounded-full bg-base-200 px-4 py-2 text-base font-medium text-white transition-colors hover:bg-base-300"
        >
          Open public profile
        </Link>
      </div>

      {/* Avatar Preview */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <img
            src={previewImageUrl || (address ? blo(address as `0x${string}`) : "")}
            onError={handleImageError}
            width={80}
            height={80}
            className="w-20 h-20 rounded-full object-cover border-2 border-base-300"
            alt="Profile preview"
          />
        </div>
        <div className="flex-1">
          <p className="text-base text-base-content/60 mb-1">Profile preview</p>
          <p className="text-xl font-semibold">{nameInput || "Your Name"}</p>
          <p className="text-base text-base-content/50 font-mono">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
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
          <InfoTooltip text="Leave empty to use your wallet avatar" />
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

      {/* Error message */}
      {error && (
        <div className="bg-error/10 rounded-lg p-4">
          <p className="text-error text-base">{error}</p>
        </div>
      )}

      {/* Info Box */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: "#112840",
        }}
      >
        <p className="text-base text-white/80">
          Your profile is stored publicly on the blockchain. A small gas fee is required to{" "}
          {hasProfile ? "update" : "create"} your profile.
        </p>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSave}
        className="btn btn-curyo w-full"
        disabled={isPending || !nameInput.trim() || nameIsTaken}
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
