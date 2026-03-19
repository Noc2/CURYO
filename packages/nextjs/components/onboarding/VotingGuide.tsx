"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "wagmi";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useOnboarding } from "~~/hooks/useOnboarding";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";

const STEPS = [
  {
    label: "Connect wallet & claim Voter ID",
    desc: "link your wallet and claim a Voter ID so you can vote, stake, and claim rewards",
  },
  { label: "Vote", desc: "place your prediction while the vote direction stays hidden" },
  { label: "Stake", desc: "back your prediction with cREP tokens" },
  { label: "Reveal & Resolve", desc: "votes are revealed after the blind phase, and rounds settle automatically" },
  { label: "Claim", desc: "collect your rewards if your prediction was correct" },
];

/**
 * Right-side popup explaining the 5-step voting flow.
 * Shows once before the first vote until dismissed.
 */
export function VotingGuide() {
  const { shouldShowGuide, dismissGuide } = useOnboarding();
  const { openConnectModal } = useConnectModal();
  const { address } = useAccount();
  const { hasVoterId } = useVoterIdNFT(address);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !shouldShowGuide) return null;

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
        <div className="relative rounded-t-2xl border-b border-base-content/5 px-5 pt-5 pb-4">
          <button
            onClick={dismissGuide}
            className="absolute top-3 right-3 btn btn-ghost btn-xs btn-circle"
            aria-label="Dismiss guide"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
          <h3 className="font-bold text-lg leading-snug pr-6">How it works</h3>
          <p className="mt-2 pr-6 text-sm leading-relaxed text-base-content/65">
            Getting started takes a bit more effort because Curyo is fully decentralized, but after the initial setup,
            it gets much easier.
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-3 px-5 py-4">
          {STEPS.map((step, i) => (
            <div key={step.label} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-base-300 text-xs font-bold text-base-content/75">
                {i + 1}
              </span>
              <p className="text-sm leading-snug text-base-content/70">
                <span className="font-semibold text-base-content">{step.label}</span>
                <span> — {step.desc}</span>
              </p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4">
          {!address ? (
            <button type="button" onClick={() => openConnectModal?.()} className="btn btn-primary btn-sm w-full">
              Connect wallet
            </button>
          ) : !hasVoterId ? (
            <Link href="/governance" className="btn btn-primary btn-sm w-full">
              Get Voter ID
            </Link>
          ) : (
            <button type="button" onClick={dismissGuide} className="btn btn-primary btn-sm w-full">
              Start voting
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
