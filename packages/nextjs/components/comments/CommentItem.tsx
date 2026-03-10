"use client";

import { blo } from "blo";
import type { CommentData } from "~~/hooks/useComments";
import { getProxiedProfileImageUrl } from "~~/utils/profileImage";

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

export function CommentItem({ comment }: { comment: CommentData }) {
  const displayName = comment.username || `${comment.walletAddress.slice(0, 6)}...${comment.walletAddress.slice(-4)}`;
  const fallbackImageUrl = blo(comment.walletAddress as `0x${string}`);
  const avatarSrc = getProxiedProfileImageUrl(comment.profileImageUrl) || fallbackImageUrl;

  return (
    <div className="flex gap-2.5">
      <img
        src={avatarSrc}
        onError={e => {
          e.currentTarget.src = fallbackImageUrl;
        }}
        width={32}
        height={32}
        className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5"
        alt={`${displayName} avatar`}
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm text-base-content/80 truncate">{displayName}</span>
          <span className="text-xs text-base-content/40 shrink-0">{getTimeAgo(new Date(comment.createdAt))}</span>
        </div>
        <p className="text-sm text-base-content/70 mt-0.5 break-words whitespace-pre-wrap">{comment.body}</p>
      </div>
    </div>
  );
}
