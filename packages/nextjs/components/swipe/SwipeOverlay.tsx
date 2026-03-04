"use client";

import { motion, useMotionValue, useTransform } from "framer-motion";

interface SwipeOverlayProps {
  x: ReturnType<typeof useMotionValue<number>>;
}

/**
 * YES / NOPE overlay indicators during swipe drag.
 * Opacity tied to x position.
 */
export function SwipeOverlay({ x }: SwipeOverlayProps) {
  const yesOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);

  return (
    <>
      <motion.div className="absolute top-8 left-8 z-10 pointer-events-none" style={{ opacity: yesOpacity }}>
        <div className="w-14 h-14 rounded-full bg-accent/20 border-2 border-accent flex items-center justify-center -rotate-12">
          <svg
            className="w-6 h-6 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </div>
      </motion.div>

      <motion.div className="absolute top-8 right-8 z-10 pointer-events-none" style={{ opacity: nopeOpacity }}>
        <div className="w-14 h-14 rounded-full bg-neutral/20 border-2 border-neutral flex items-center justify-center rotate-12">
          <svg
            className="w-6 h-6 text-neutral"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </motion.div>
    </>
  );
}
