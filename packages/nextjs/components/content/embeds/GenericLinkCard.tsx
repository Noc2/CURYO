"use client";

import { LinkIcon } from "@heroicons/react/24/outline";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";

interface GenericLinkCardProps {
  url: string;
  compact?: boolean;
  thumbnailUrl?: string | null;
}

export function GenericLinkCard({ url, compact, thumbnailUrl }: GenericLinkCardProps) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  return (
    <SafeExternalLink
      href={url}
      className={`flex h-full min-h-[8rem] overflow-hidden rounded-lg bg-base-200 embed-surface embed-surface-hover transition-colors ${
        compact ? "text-sm" : ""
      }`}
    >
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" className="h-full min-h-[8rem] w-1/2 object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full min-h-[8rem] w-1/2 shrink-0 items-center justify-center bg-primary/10">
          <LinkIcon className="h-8 w-8 text-primary" />
        </div>
      )}
      <div className={`flex min-w-0 flex-1 flex-col justify-center ${compact ? "p-3" : "p-5"}`}>
        <p className="truncate text-base font-medium">{hostname}</p>
        <p className="mt-0.5 text-base text-base-content/50">Open context</p>
      </div>
    </SafeExternalLink>
  );
}
