"use client";

interface GoalDisplayProps {
  goal: string;
  compact?: boolean;
}

/**
 * Displays the content's goal text.
 */
export function GoalDisplay({ goal, compact = false }: GoalDisplayProps) {
  return (
    <div>
      <p
        className={`text-base-content/80 leading-relaxed ${compact ? "text-base line-clamp-2" : "text-base line-clamp-3"}`}
      >
        {goal}
      </p>
    </div>
  );
}
