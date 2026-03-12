"use client";

interface ContentDescriptionProps {
  description: string;
  compact?: boolean;
}

export function ContentDescription({ description, compact = false }: ContentDescriptionProps) {
  return (
    <p
      className={
        compact
          ? "text-sm text-base-content/80 line-clamp-2"
          : "text-base text-base-content/85 leading-relaxed line-clamp-3"
      }
    >
      {description}
    </p>
  );
}
