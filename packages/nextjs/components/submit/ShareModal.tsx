"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, ClipboardIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { truncateContentTitle } from "~~/lib/contentTitle";

interface ShareModalProps {
  contentId: bigint;
  title: string;
  description: string;
  onClose: () => void;
}

export function ShareModal({ contentId, title, description, onClose }: ShareModalProps) {
  const [copied, setCopied] = useState(false);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/vote?content=${contentId}` : "";
  const truncatedTitle = truncateContentTitle(title);
  const tweetText = `I just submitted "${truncatedTitle}" on Curyo! Vote and build your reputation: ${shareUrl}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = shareUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label="Content submitted">
      <div className="modal-box w-[calc(100vw-2rem)] max-w-md overflow-x-hidden bg-base-200 px-5 py-6 shadow-2xl sm:px-6">
        {/* Close button */}
        <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" aria-label="Close">
          <XMarkIcon className="w-5 h-5" />
        </button>

        {/* Success icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <CheckIcon className="w-8 h-8 text-primary" />
          </div>
        </div>

        <h3 className="text-xl font-semibold text-center mb-2">Content Submitted!</h3>
        <p className="mb-2 text-center text-lg font-medium text-base-content line-clamp-2">{title}</p>
        <p className="text-base text-base-content/60 text-center mb-6">{description}</p>

        {/* Share buttons */}
        <div className="space-y-3">
          {/* Twitter/X share */}
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary w-full gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </a>

          {/* Copy link */}
          <button onClick={handleCopyLink} className="btn btn-outline w-full gap-2">
            {copied ? (
              <>
                <CheckIcon className="w-5 h-5 text-success" />
                Copied!
              </>
            ) : (
              <>
                <ClipboardIcon className="w-5 h-5" />
                Copy Link
              </>
            )}
          </button>

          {/* View content */}
          <Link href={`/vote?content=${contentId}`} className="btn btn-ghost w-full">
            View Content
          </Link>
        </div>

        {/* Divider */}
        <div className="divider my-4">or</div>

        {/* Submit another - 16px minimum */}
        <button onClick={onClose} className="btn btn-ghost w-full text-base-content/60 text-base">
          Submit Another
        </button>
      </div>
      <div className="modal-backdrop bg-black/60 backdrop-blur-sm" aria-hidden="true" />
    </div>
  );
}
