"use client";

import { useState } from "react";
import { PaperAirplaneIcon } from "@heroicons/react/24/solid";
import { containsBlockedText } from "~~/utils/contentFilter";
import { notification } from "~~/utils/scaffold-eth";

interface CommentInputProps {
  onSubmit: (body: string) => Promise<boolean>;
  isSubmitting: boolean;
  error: string | null;
}

export function CommentInput({ onSubmit, isSubmitting, error }: CommentInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = async () => {
    if (!text.trim() || isSubmitting) return;
    if (containsBlockedText(text).blocked) {
      notification.warning("Your comment contains prohibited content");
      return;
    }
    const success = await onSubmit(text);
    if (success) setText("");
  };

  return (
    <div className="space-y-2">
      {error && <p className="text-error text-xs">{error}</p>}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Write a comment..."
          aria-label="Write a comment"
          className="textarea textarea-bordered flex-1 text-sm bg-base-100 resize-none min-h-[40px] max-h-[120px]"
          maxLength={500}
          rows={1}
          disabled={isSubmitting}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !text.trim()}
          className="btn btn-primary btn-sm btn-square self-end"
          aria-label="Submit comment"
        >
          {isSubmitting ? (
            <span className="loading loading-spinner loading-xs" />
          ) : (
            <PaperAirplaneIcon className="w-4 h-4" />
          )}
        </button>
      </div>
      <p className="text-xs text-base-content/40 text-right">{text.length}/500</p>
    </div>
  );
}
