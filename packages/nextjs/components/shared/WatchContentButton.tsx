"use client";

import { BookmarkIcon as BookmarkOutlineIcon } from "@heroicons/react/24/outline";
import { BookmarkIcon as BookmarkSolidIcon } from "@heroicons/react/24/solid";

interface WatchContentButtonProps {
  watched: boolean;
  pending?: boolean;
  onClick: () => void;
  variant?: "ghost" | "overlay";
}

export function WatchContentButton({ watched, pending = false, onClick, variant = "ghost" }: WatchContentButtonProps) {
  const Icon = watched ? BookmarkSolidIcon : BookmarkOutlineIcon;
  const label = watched ? "Watching" : "Watch";
  const className =
    variant === "overlay"
      ? `rounded bg-black/60 p-1 backdrop-blur hover:bg-black/80 ${
          watched ? "text-primary opacity-100" : "text-base-content opacity-0 group-hover:opacity-100"
        } transition-opacity`
      : `btn btn-ghost btn-sm btn-circle ${
          watched ? "text-primary hover:text-primary" : "text-base-content/50 hover:text-base-content"
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
      {pending ? <span className="loading loading-spinner loading-xs"></span> : <Icon className="w-4 h-4" />}
    </button>
  );
}
