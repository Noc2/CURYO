"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { CheckIcon, ClipboardIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { buildRateContentHref } from "~~/constants/routes";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth";
import { truncateContentTitle } from "~~/lib/contentTitle";
import { type ContentShareContentInput, buildContentShareData } from "~~/lib/social/contentShare";

interface ShareModalProps {
  contentId: bigint;
  title: string;
  description: string;
  rating?: number;
  ratingBps?: number;
  totalVotes?: number;
  lastActivityAt?: string | null;
  openRound?: ContentShareContentInput["openRound"];
  onClose: () => void;
}

export function ShareModal({
  contentId,
  title,
  description,
  rating = 50,
  ratingBps,
  totalVotes = 0,
  lastActivityAt,
  openRound,
  onClose,
}: ShareModalProps) {
  const { copyToClipboard, isCopiedToClipboard: copied } = useCopyToClipboard({ successDurationMs: 2000 });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const shareDetails = useMemo(() => {
    if (typeof window === "undefined") return { ratingLabel: null, url: "" };

    const shareData = buildContentShareData(
      {
        id: contentId.toString(),
        title,
        description,
        rating,
        ratingBps,
        totalVotes,
        lastActivityAt,
        openRound,
      },
      window.location.origin,
    );

    return { ratingLabel: shareData.rating.label, url: shareData.shareUrl };
  }, [contentId, description, lastActivityAt, openRound, rating, ratingBps, title, totalVotes]);
  const shareUrl = shareDetails.url;
  const truncatedTitle = truncateContentTitle(title);
  const tweetText = shareDetails.ratingLabel
    ? `I just asked "${truncatedTitle}" on Curyo. Current rating: ${shareDetails.ratingLabel}/10. Rate and build your reputation: ${shareUrl}`
    : `I just asked "${truncatedTitle}" on Curyo! Rate and build your reputation: ${shareUrl}`;

  const handleCopyLink = async () => {
    await copyToClipboard(shareUrl);
  };

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label="Question asked">
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

        <h3 className="text-xl font-semibold text-center mb-2">Question Asked!</h3>
        <p className="mb-2 text-center text-lg font-medium text-base-content line-clamp-2">{title}</p>
        {description ? <p className="text-base text-base-content/60 text-center mb-6">{description}</p> : null}

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
          <Link href={buildRateContentHref(contentId)} className="btn btn-ghost w-full">
            View Content
          </Link>
        </div>

        {/* Divider */}
        <div className="divider my-4">or</div>

        {/* Ask another - 16px minimum */}
        <button onClick={onClose} className="btn btn-ghost w-full text-base-content/60 text-base">
          Ask Another
        </button>
      </div>
      <div className="modal-backdrop bg-black/60 backdrop-blur-sm" aria-hidden="true" />
    </div>
  );
}
