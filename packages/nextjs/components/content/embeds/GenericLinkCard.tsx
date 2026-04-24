"use client";

import React from "react";
import { LinkIcon } from "@heroicons/react/24/outline";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";

interface GenericLinkCardProps {
  url: string;
  compact?: boolean;
  thumbnailUrl?: string | null;
}

function ContextPlaceholderArtwork({ hostname, compact }: { hostname: string; compact?: boolean }) {
  return (
    <div className="relative flex h-full min-h-[8rem] w-full overflow-hidden bg-[#101014]">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(213,115,62,0.18),rgba(16,16,20,0)_38%),linear-gradient(160deg,rgba(255,255,255,0.08),rgba(255,255,255,0)_30%)]" />
      <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="absolute -right-16 top-8 h-14 w-72 -rotate-12 bg-primary/10" />
      <div className="absolute -left-10 bottom-12 h-px w-2/3 bg-base-content/20" />
      <div className={`relative z-10 flex h-full w-full flex-col justify-between ${compact ? "p-4" : "p-6"}`}>
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-md border border-primary/25 bg-base-100/70 text-primary shadow-sm backdrop-blur">
          <LinkIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary/85">Context</p>
          <p className={`${compact ? "text-base" : "text-lg"} mt-1 truncate font-semibold text-base-content`}>
            {hostname}
          </p>
        </div>
      </div>
    </div>
  );
}

export function GenericLinkCard({ url, compact, thumbnailUrl }: GenericLinkCardProps) {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url;
  }

  if (!thumbnailUrl) {
    return (
      <SafeExternalLink
        href={url}
        title={`Open context: ${hostname}`}
        ariaLabel={`Open context: ${hostname}`}
        className={`block h-full min-h-[8rem] w-full overflow-hidden rounded-lg bg-base-200 embed-surface embed-surface-hover transition-colors ${
          compact ? "text-sm" : ""
        }`}
      >
        <ContextPlaceholderArtwork hostname={hostname} compact={compact} />
      </SafeExternalLink>
    );
  }

  return (
    <SafeExternalLink
      href={url}
      title={`Open context: ${hostname}`}
      ariaLabel={`Open context: ${hostname}`}
      className={`flex h-full min-h-[8rem] overflow-hidden rounded-lg bg-base-200 embed-surface embed-surface-hover transition-colors ${
        compact ? "text-sm" : ""
      }`}
    >
      <img src={thumbnailUrl} alt="" className="h-full min-h-[8rem] w-1/2 object-cover" loading="lazy" />
      <div className={`flex min-w-0 flex-1 flex-col justify-center ${compact ? "p-3" : "p-5"}`}>
        <p className="truncate text-base font-medium">{hostname}</p>
        <p className="mt-0.5 text-base text-base-content/50">Open context</p>
      </div>
    </SafeExternalLink>
  );
}
