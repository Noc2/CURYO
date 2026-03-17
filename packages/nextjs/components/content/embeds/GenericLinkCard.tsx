"use client";

import { LinkIcon } from "@heroicons/react/24/outline";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";

interface GenericLinkCardProps {
  url: string;
  compact?: boolean;
}

export function GenericLinkCard({ url, compact }: GenericLinkCardProps) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  return (
    <SafeExternalLink
      href={url}
      className={`flex items-center gap-3 rounded-xl bg-base-200 embed-surface embed-surface-hover transition-colors ${
        compact ? "p-3" : "p-5"
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <LinkIcon className="w-5 h-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-base font-medium truncate">{hostname}</p>
        <p className="text-base text-base-content/50 mt-0.5">Click to view content</p>
      </div>
    </SafeExternalLink>
  );
}
