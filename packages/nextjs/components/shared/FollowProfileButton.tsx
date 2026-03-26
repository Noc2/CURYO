"use client";

import { CheckIcon, UserPlusIcon } from "@heroicons/react/24/outline";

interface FollowProfileButtonProps {
  following: boolean;
  pending?: boolean;
  onClick: () => void;
  variant?: "compact" | "pill";
}

export function FollowProfileButton({
  following,
  pending = false,
  onClick,
  variant = "compact",
}: FollowProfileButtonProps) {
  const label = following ? "Following" : "Follow";
  const className =
    variant === "pill"
      ? `btn btn-sm rounded-full border-none ${
          following
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "bg-base-200 text-base-content/80 hover:text-base-content"
        }`
      : `inline-flex items-center justify-center rounded-full p-1.5 transition-colors ${
          following
            ? "bg-primary/10 text-primary hover:bg-primary/15"
            : "bg-base-200 text-base-content/70 hover:text-base-content"
        }`;

  return (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        onClick();
      }}
      className={className}
      aria-label={label}
      title={label}
      disabled={pending}
    >
      {pending ? (
        <span className="loading loading-spinner loading-xs"></span>
      ) : variant === "pill" ? (
        <span className="inline-flex items-center gap-1.5">
          {following ? <CheckIcon className="h-4 w-4" /> : <UserPlusIcon className="h-4 w-4" />}
          <span>{label}</span>
        </span>
      ) : following ? (
        <CheckIcon className="h-4 w-4" />
      ) : (
        <UserPlusIcon className="h-4 w-4" />
      )}
    </button>
  );
}
