"use client";

import { useEffect, useState } from "react";
import { blo } from "blo";
import { useAccount, useSignMessage } from "wagmi";
import { CheckIcon, PencilIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface UsernameEditorProps {
  onProfileChange?: (profile: { username: string | null; profileImageUrl: string | null }) => void;
  /** Called after profile is successfully updated (for triggering external refreshes) */
  onProfileUpdate?: () => void;
}

// Helper to validate image URL format
function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function UsernameEditor({ onProfileChange, onProfileUpdate }: UsernameEditorProps) {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [username, setUsername] = useState<string | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [isEditingImage, setIsEditingImage] = useState(false);

  const [usernameInput, setUsernameInput] = useState("");
  const [imageInput, setImageInput] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch current profile on mount
  useEffect(() => {
    if (!address) {
      setIsFetching(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const res = await fetch(`/api/username?address=${address}`);
        if (!res.ok) throw new Error(`Profile API returned ${res.status}`);
        const data = await res.json();
        setUsername(data.username);
        setProfileImageUrl(data.profileImageUrl);
        onProfileChange?.({ username: data.username, profileImageUrl: data.profileImageUrl });
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setIsFetching(false);
      }
    };

    fetchProfile();
  }, [address, onProfileChange]);

  const handleEditUsername = () => {
    setUsernameInput(username || "");
    setIsEditingUsername(true);
    setIsEditingImage(false);
    setError(null);
  };

  const handleEditImage = () => {
    setImageInput(profileImageUrl || "");
    setIsEditingImage(true);
    setIsEditingUsername(false);
    setError(null);
  };

  const handleCancel = () => {
    setIsEditingUsername(false);
    setIsEditingImage(false);
    setUsernameInput("");
    setImageInput("");
    setError(null);
  };

  const requestProfileChallenge = async (payload: { username?: string; profileImageUrl?: string | null }) => {
    const res = await fetch("/api/username/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address,
        ...payload,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to create signature challenge");
    }

    return data as { challengeId: string; message: string; expiresAt: string };
  };

  const handleSaveUsername = async () => {
    if (!address || !usernameInput.trim()) return;

    // Validate username format
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(usernameInput)) {
      setError("3-20 characters (letters, numbers, underscores)");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const challenge = await requestProfileChallenge({ username: usernameInput });
      const signature = await signMessageAsync({ message: challenge.message });

      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          username: usernameInput,
          challengeId: challenge.challengeId,
          signature,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save username");
        return;
      }

      setUsername(data.username);
      onProfileChange?.({ username: data.username, profileImageUrl });
      onProfileUpdate?.();
      setIsEditingUsername(false);
    } catch (err) {
      if ((err as Error).message?.includes("rejected")) {
        setError("Signature rejected");
      } else {
        setError("Failed to save username");
      }
      console.error("Error saving username:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveImage = async () => {
    if (!address) return;

    // Validate URL format (empty string is allowed to remove image)
    if (imageInput && !isValidImageUrl(imageInput)) {
      setError("Please enter a valid http/https URL");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const challenge = await requestProfileChallenge({ profileImageUrl: imageInput || null });
      const signature = await signMessageAsync({ message: challenge.message });

      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          profileImageUrl: imageInput || null,
          challengeId: challenge.challengeId,
          signature,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to save profile image");
        return;
      }

      setProfileImageUrl(data.profileImageUrl);
      onProfileChange?.({ username, profileImageUrl: data.profileImageUrl });
      onProfileUpdate?.();
      setIsEditingImage(false);
    } catch (err) {
      if ((err as Error).message?.includes("rejected")) {
        setError("Signature rejected");
      } else {
        setError("Failed to save profile image");
      }
      console.error("Error saving profile image:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    if (address) {
      e.currentTarget.src = blo(address as `0x${string}`);
    }
  };

  if (isFetching) {
    return (
      <div className="flex items-center gap-2">
        <span className="loading loading-spinner loading-sm"></span>
        <span className="text-base-content/50">Loading...</span>
      </div>
    );
  }

  // Editing username
  if (isEditingUsername) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={usernameInput}
            onChange={e => setUsernameInput(e.target.value)}
            placeholder="Enter username"
            className="input input-bordered input-sm w-40 bg-base-100"
            maxLength={20}
            disabled={isLoading}
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") handleSaveUsername();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <button
            onClick={handleSaveUsername}
            disabled={isLoading || !usernameInput.trim()}
            className="btn btn-sm btn-curyo btn-square"
            aria-label="Save username"
          >
            {isLoading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              <CheckIcon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="btn btn-sm btn-ghost btn-square"
            aria-label="Cancel editing"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        {error && <p className="text-error text-base">{error}</p>}
      </div>
    );
  }

  // Editing image
  if (isEditingImage) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="url"
            value={imageInput}
            onChange={e => setImageInput(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="input input-bordered input-sm w-64 bg-base-100"
            disabled={isLoading}
            autoFocus
            aria-label="Profile image URL"
            onKeyDown={e => {
              if (e.key === "Enter") handleSaveImage();
              if (e.key === "Escape") handleCancel();
            }}
          />
          <button
            onClick={handleSaveImage}
            disabled={isLoading}
            className="btn btn-sm btn-curyo btn-square"
            aria-label="Save image"
          >
            {isLoading ? (
              <span className="loading loading-spinner loading-xs"></span>
            ) : (
              <CheckIcon className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="btn btn-sm btn-ghost btn-square"
            aria-label="Cancel editing"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
        <p className="text-base text-base-content/50">Enter image URL (leave empty to remove)</p>
        {error && <p className="text-error text-base">{error}</p>}
      </div>
    );
  }

  // Default display
  return (
    <div className="flex items-center gap-3">
      {/* Avatar with edit button */}
      <div className="relative group">
        <img
          src={profileImageUrl || (address ? blo(address as `0x${string}`) : "")}
          onError={handleImageError}
          width={48}
          height={48}
          className="w-12 h-12 rounded-full object-cover"
          alt="Profile"
        />
        <button
          onClick={handleEditImage}
          className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="Change profile image"
        >
          <PhotoIcon className="w-5 h-5 text-white" />
        </button>
      </div>

      {/* Username with edit button */}
      <div className="flex items-center gap-2">
        {username ? (
          <span className="font-semibold text-lg">{username}</span>
        ) : (
          <span className="text-base-content/50 italic">No username set</span>
        )}
        <button onClick={handleEditUsername} className="btn btn-sm btn-ghost btn-square" aria-label="Edit username">
          <PencilIcon className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
