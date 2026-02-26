"use client";

import { useEffect, useRef } from "react";
import { CommentInput } from "./CommentInput";
import { CommentItem } from "./CommentItem";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "wagmi";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useComments } from "~~/hooks/useComments";

interface CommentDrawerProps {
  contentId: bigint;
  open: boolean;
  onClose: () => void;
}

export function CommentDrawer({ contentId, open, onClose }: CommentDrawerProps) {
  const { address } = useAccount();
  const { comments, count, isLoading, submitComment, isSubmitting, submitError } = useComments(open ? contentId : null);
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when new comments arrive
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [comments.length]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: 100 }}>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer panel */}
          <motion.div
            role="dialog"
            aria-label="Comments"
            className="absolute top-0 right-0 h-full w-full max-w-md bg-base-200 border-l border-base-content/10 shadow-2xl flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-base-content/10">
              <h3 className="text-lg font-semibold">Comments ({count})</h3>
              <button onClick={onClose} className="btn btn-sm btn-circle btn-ghost" aria-label="Close comments">
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Comment list */}
            <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <span className="loading loading-spinner loading-md text-primary" />
                </div>
              ) : comments.length === 0 ? (
                <div className="text-center py-8 text-base-content/50">No comments yet. Be the first!</div>
              ) : (
                comments.map(comment => <CommentItem key={comment.id} comment={comment} />)
              )}
            </div>

            {/* Input area */}
            <div className="border-t border-base-content/10 px-4 py-3">
              {address ? (
                <CommentInput onSubmit={submitComment} isSubmitting={isSubmitting} error={submitError} />
              ) : (
                <p className="text-center text-base-content/50 text-sm py-2">Connect your wallet to comment</p>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
