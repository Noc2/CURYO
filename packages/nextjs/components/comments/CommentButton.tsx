"use client";

import { ChatBubbleLeftIcon } from "@heroicons/react/24/outline";
import { useCommentCount } from "~~/hooks/useCommentCount";

interface CommentButtonProps {
  contentId: bigint;
  onOpen: () => void;
}

export function CommentButton({ contentId, onOpen }: CommentButtonProps) {
  const count = useCommentCount(contentId);

  return (
    <button
      onClick={onOpen}
      className="btn btn-ghost btn-sm btn-circle text-base-content/50 hover:text-base-content relative"
      aria-label={`Comments${count > 0 ? ` (${count})` : ""}`}
    >
      <ChatBubbleLeftIcon className="w-4 h-4" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 bg-primary text-primary-content text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-medium leading-none">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
