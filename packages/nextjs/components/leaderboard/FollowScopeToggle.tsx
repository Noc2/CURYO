"use client";

interface FollowScopeToggleProps {
  value: "all" | "following";
  onChange: (value: "all" | "following") => void;
}

export function FollowScopeToggle({ value, onChange }: FollowScopeToggleProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={value === "all"}
        className={`px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
          value === "all" ? "pill-category" : "bg-base-200 text-white hover:bg-base-300"
        }`}
      >
        All
      </button>
      <button
        type="button"
        onClick={() => onChange("following")}
        aria-pressed={value === "following"}
        className={`px-3 py-1.5 rounded-full text-base font-medium transition-colors ${
          value === "following" ? "pill-category" : "bg-base-200 text-white hover:bg-base-300"
        }`}
      >
        Following Only
      </button>
    </div>
  );
}
