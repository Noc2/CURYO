"use client";

import { ChevronDownIcon } from "@heroicons/react/24/outline";

interface MoreToggleButtonProps {
  expanded: boolean;
  onClick: () => void;
  className?: string;
  controlsId?: string;
}

export function MoreToggleButton({ expanded, onClick, className = "", controlsId }: MoreToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      aria-controls={controlsId}
      aria-label={expanded ? "Collapse details" : "Expand details"}
      className={`inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-base-content/60 transition-colors hover:text-base-content/85 ${className}`}
    >
      <span>More</span>
      <ChevronDownIcon className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
    </button>
  );
}
