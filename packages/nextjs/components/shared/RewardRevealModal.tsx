"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CelebrationBurst } from "~~/components/shared/CelebrationBurst";

type Outcome = "win" | "loss" | "tie";

interface RewardRevealModalProps {
  isOpen: boolean;
  outcome: Outcome;
  amount: bigint; // reward (win/tie) or lost amount (loss)
  stake: bigint;
  /** Near-miss data for loss outcome */
  upPool?: bigint;
  downPool?: bigint;
  onClaim: () => void;
  onClose: () => void;
}

function formatAmount(wei: bigint): string {
  return (Number(wei) / 1e6).toFixed(0);
}

function NearMissFeedback({ upPool, downPool }: { upPool: bigint; downPool: bigint }) {
  const total = upPool + downPool;
  if (total === 0n) return null;

  const upPct = Number((upPool * 100n) / total);
  const downPct = 100 - upPct;
  const minority = Math.min(upPct, downPct);
  const isNearMiss = minority >= 40;

  return (
    <div className="mt-3 space-y-1.5">
      {/* Vote margin bar */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-success font-medium">{upPct}% UP</span>
        <div className="flex-1 h-1.5 rounded-full bg-base-content/10 overflow-hidden">
          <div className="h-full bg-success rounded-full" style={{ width: `${upPct}%` }} />
        </div>
        <span className="text-error font-medium">{downPct}% DOWN</span>
      </div>
      {isNearMiss && <p className="text-xs text-warning text-center">So close! Just {Math.abs(upPct - 50)}% away</p>}
    </div>
  );
}

export function RewardRevealModal({
  isOpen,
  outcome,
  amount,
  stake,
  upPool,
  downPool,
  onClaim,
  onClose,
}: RewardRevealModalProps) {
  const [phase, setPhase] = useState<"flip" | "result">("flip");

  // Reset phase on open
  useEffect(() => {
    if (isOpen) {
      setPhase("flip");
      const timer = setTimeout(() => setPhase("result"), 1000);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  const handleClaim = useCallback(() => {
    onClaim();
    onClose();
  }, [onClaim, onClose]);

  const outcomeConfig = {
    win: { color: "text-success", bg: "bg-success/10", label: "You Won!", icon: "+" },
    loss: { color: "text-error", bg: "bg-error/10", label: "You Lost", icon: "-" },
    tie: { color: "text-info", bg: "bg-info/10", label: "Tied — Refund", icon: "" },
  }[outcome];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Reward reveal"
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Card */}
          <motion.div
            className="relative w-72 sm:w-80"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
          >
            {/* Flip animation */}
            <motion.div
              className={`relative ${outcomeConfig.bg} rounded-2xl p-8 text-center border border-base-content/10 shadow-2xl overflow-hidden`}
              initial={{ rotateY: 0 }}
              animate={{ rotateY: phase === "result" ? 0 : 180 }}
              transition={{ duration: 0.6, ease: "easeInOut" }}
              style={{ perspective: 1000, backfaceVisibility: "hidden" }}
            >
              {/* Celebration burst for wins and ties */}
              {phase === "result" && (outcome === "win" || outcome === "tie") && <CelebrationBurst />}

              {phase === "flip" ? (
                /* Phase 1: Mystery card */
                <div className="flex flex-col items-center gap-4 py-6">
                  <div className="w-16 h-16 rounded-full bg-base-content/10 flex items-center justify-center">
                    <span className="text-3xl">?</span>
                  </div>
                  <p className="text-base-content/60 text-sm">Revealing result...</p>
                </div>
              ) : (
                /* Phase 2: Result */
                <div className="flex flex-col items-center gap-3 relative z-10">
                  <p className={`text-2xl font-bold ${outcomeConfig.color}`}>{outcomeConfig.label}</p>
                  <p className={`text-4xl font-bold tabular-nums ${outcomeConfig.color}`}>
                    {outcomeConfig.icon}
                    {formatAmount(amount)} cREP
                  </p>
                  {outcome === "win" && stake > 0n && (
                    <p className="text-xs text-base-content/50">
                      Staked {formatAmount(stake)} — earned {formatAmount(amount - stake)} profit
                    </p>
                  )}

                  {/* Near-miss feedback for losses (F3) */}
                  {outcome === "loss" && upPool !== undefined && downPool !== undefined && (
                    <NearMissFeedback upPool={upPool} downPool={downPool} />
                  )}

                  {/* Action button */}
                  <div className="mt-4 w-full">
                    {outcome === "loss" ? (
                      <button onClick={onClose} className="btn btn-ghost btn-sm w-full">
                        Continue
                      </button>
                    ) : (
                      <button
                        onClick={handleClaim}
                        className={`btn btn-sm w-full text-white ${outcome === "win" ? "btn-success" : "btn-info"}`}
                      >
                        {outcome === "win"
                          ? `Claim ${formatAmount(amount)} cREP`
                          : `Claim Refund ${formatAmount(amount)} cREP`}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
