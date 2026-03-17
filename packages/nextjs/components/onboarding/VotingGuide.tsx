"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "wagmi";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useOnboarding } from "~~/hooks/useOnboarding";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

// Obsidian Ember onboarding colors: steel, ember, warm white, and rust.
const STEPS = [
  { label: "Browse", desc: "explore submitted content in the feed", hex: "#7E8996", tone: "rgba(126, 137, 150, 0.18)" },
  {
    label: "Vote",
    desc: "predict and place your vote — direction is hidden until the blind phase ends",
    hex: "#F26426",
    tone: "rgba(242, 100, 38, 0.18)",
  },
  { label: "Stake", desc: "back your prediction with cREP tokens", hex: "#F5F0EB", tone: "rgba(245, 240, 235, 0.14)" },
  {
    label: "Reveal & Resolve",
    desc: "votes are revealed after each blind phase (~20 min); rounds resolve automatically",
    hex: "#B3341B",
    tone: "rgba(179, 52, 27, 0.18)",
  },
  {
    label: "Claim",
    desc: "collect your rewards if your prediction was correct",
    hex: "#7E8996",
    tone: "rgba(126, 137, 150, 0.16)",
  },
];

/**
 * Right-side popup explaining the 5-step voting flow.
 * Only appears once a user has claimed their Voter ID, and only once.
 */
export function VotingGuide() {
  const { shouldShowGuide, dismissGuide } = useOnboarding();
  const { address } = useAccount();
  const { hasVoterId, isLoading } = useVoterIdNFT(address);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Don't show until we know voter ID status, and only if they have one
  if (!mounted || isLoading || !shouldShowGuide || !hasVoterId) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 80 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 80 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed right-4 top-24 z-50 w-80 rounded-2xl bg-base-200 shadow-[0_24px_54px_rgba(9,10,12,0.42)]"
      >
        {/* Header */}
        <div
          className="relative rounded-t-2xl px-5 pt-5 pb-4"
          style={{
            background:
              "linear-gradient(135deg, rgba(242,100,38,0.18) 0%, rgba(245,240,235,0.05) 42%, rgba(179,52,27,0.16) 100%)",
          }}
        >
          <button
            onClick={dismissGuide}
            className="absolute top-3 right-3 btn btn-ghost btn-xs btn-circle"
            aria-label="Dismiss guide"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
          <h3 className="font-bold text-lg leading-snug pr-6">Here&apos;s how the reputation game works:</h3>
        </div>

        {/* Steps */}
        <div className="px-5 py-4 space-y-3">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-start gap-3">
              <span
                className="shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
                style={{ color: step.hex, backgroundColor: step.tone }}
              >
                {i + 1}
              </span>
              <p className="text-sm leading-snug">
                <span className="font-semibold" style={{ color: step.hex }}>
                  {step.label}
                </span>
                <span className="text-base-content/60"> — {step.desc}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4">
          <button onClick={dismissGuide} className="btn btn-primary btn-sm w-full">
            Got it!
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
