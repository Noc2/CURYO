"use client";

import type { DiscoverFeedMode, DiscoverFeedModeOption } from "~~/lib/vote/feedModes";

interface FeedModeToggleProps {
  value: DiscoverFeedMode;
  options: DiscoverFeedModeOption[];
  onChange: (value: DiscoverFeedMode) => void;
}

export function FeedModeToggle({ value, options, onChange }: FeedModeToggleProps) {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Discover feed modes">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          title={option.description}
          className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:text-base ${
            value === option.value ? "pill-category" : "bg-base-200 text-white hover:bg-base-300"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
