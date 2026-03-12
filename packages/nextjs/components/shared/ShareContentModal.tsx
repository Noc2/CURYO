"use client";

import { useEffect, useState } from "react";
import { CheckIcon, ClipboardIcon, XMarkIcon } from "@heroicons/react/24/outline";

interface ShareContentModalProps {
  contentId: bigint;
  title: string;
  description: string;
  onClose: () => void;
}

export function ShareContentModal({ contentId, title, description, onClose }: ShareContentModalProps) {
  const [copied, setCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/vote?content=${contentId}` : "";
  const truncatedTitle = title.length > 80 ? `${title.slice(0, 80)}...` : title;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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

  const tweetText = `Check out "${truncatedTitle}" on Curyo! ${shareUrl}`;

  return (
    <div
      className="modal modal-open"
      style={{ zIndex: 100 }}
      role="dialog"
      aria-modal="true"
      aria-label="Share content"
    >
      <div className="modal-box max-w-sm bg-base-200 border border-base-content/10 shadow-2xl">
        {/* Close button */}
        <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" aria-label="Close">
          <XMarkIcon className="w-5 h-5" />
        </button>

        <h3 className="text-lg font-semibold text-center mb-1">Share this content</h3>
        <p className="text-base font-medium text-center text-white mb-2 line-clamp-2">{title}</p>
        <p className="text-sm text-base-content/60 text-center mb-5 line-clamp-2">{description}</p>

        {/* Share buttons */}
        <div className="space-y-2.5">
          {/* Twitter/X */}
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

          {/* Facebook */}
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline w-full gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Share on Facebook
          </a>

          {/* Reddit */}
          <a
            href={`https://reddit.com/submit?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(truncatedTitle)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline w-full gap-2"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.373 0 0 5.373 0 12c0 6.627 5.373 12 12 12s12-5.373 12-12c0-6.627-5.373-12-12-12zm6.066 13.71c.147.307.216.636.216.98 0 .98-.477 1.878-1.33 2.556C16.098 18.01 14.146 18.5 12 18.5c-2.146 0-4.098-.49-4.952-1.254-.853-.678-1.33-1.576-1.33-2.556 0-.344.07-.673.216-.98a1.834 1.834 0 0 1-.216-.863c0-.534.223-1.016.58-1.365a1.844 1.844 0 0 1-.034-.344c0-.534.223-1.016.58-1.365A1.844 1.844 0 0 1 8.2 8.407c.6-.346 1.357-.557 2.2-.627l1.6-3.8a.6.6 0 0 1 .713-.36l2.7.6a1.2 1.2 0 1 1-.134.587l-2.4-.533-1.42 3.373c.788.082 1.5.29 2.063.618a1.844 1.844 0 0 1 1.355.58c.358.349.58.831.58 1.365 0 .12-.012.236-.034.344.358.349.58.831.58 1.365 0 .308-.075.6-.216.863zM9.6 14.4a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm4.8 0a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4zm-4.89 1.62c.06.06.15.06.21 0 .57-.57 1.32-.84 2.28-.84.96 0 1.71.27 2.28.84a.15.15 0 0 0 .21 0 .15.15 0 0 0 0-.21c-.63-.63-1.47-.93-2.49-.93s-1.86.3-2.49.93a.15.15 0 0 0 0 .21z" />
            </svg>
            Share on Reddit
          </a>

          {/* Copy Link */}
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
        </div>
      </div>
      <div className="modal-backdrop bg-black/60 backdrop-blur-sm" onClick={onClose} />
    </div>
  );
}
