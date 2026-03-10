"use client";

import { Tweet } from "react-tweet";
import { SafeExternalLink } from "~~/components/shared/SafeExternalLink";
import type { PlatformInfo } from "~~/utils/platforms";

interface TwitterEmbedProps {
  info: PlatformInfo;
  compact?: boolean;
}

/** X/Twitter icon */
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function TwitterEmbed({ info, compact }: TwitterEmbedProps) {
  const tweetId = info.id || (info.metadata?.tweetId as string);

  if (!tweetId) {
    return (
      <SafeExternalLink
        href={info.url}
        className={`flex items-center gap-3 bg-base-200 rounded-xl hover:bg-base-300 transition-colors ${
          compact ? "p-3" : "p-5"
        }`}
      >
        <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center shrink-0">
          <XIcon className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-base font-medium truncate">Tweet not found</p>
          <p className="text-base text-base-content/50 mt-0.5">View on X</p>
        </div>
      </SafeExternalLink>
    );
  }

  return (
    <div
      className={`w-full overflow-hidden ${compact ? "max-w-[300px] mx-auto" : "max-w-[550px] mx-auto"}`}
      data-theme="dark"
    >
      <Tweet
        id={tweetId}
        fallback={
          <div className={`flex items-center gap-3 bg-base-200 rounded-xl ${compact ? "p-3" : "p-5"}`}>
            <div className="w-10 h-10 rounded-lg bg-black flex items-center justify-center shrink-0">
              <span className="loading loading-spinner loading-sm text-white"></span>
            </div>
            <div className="min-w-0">
              <p className="text-base font-medium truncate">Loading tweet...</p>
            </div>
          </div>
        }
      />
    </div>
  );
}
