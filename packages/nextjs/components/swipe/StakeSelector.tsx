"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import { useOnboarding } from "~~/hooks/useOnboarding";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useVoterIdNFT, useVoterIdStake } from "~~/hooks/useVoterIdNFT";

interface StakeSelectorProps {
  isOpen: boolean;
  isUp: boolean;
  contentId: bigint;
  categoryId?: bigint;
  onConfirm: (stakeAmount: number) => void;
  onCancel: () => void;
}

const PRESET_AMOUNTS = [1, 5, 25, 50, 100];

/**
 * Bottom-sheet modal to select stake amount before committing a vote.
 */
export function StakeSelector({ isOpen, isUp, contentId, categoryId, onConfirm, onCancel }: StakeSelectorProps) {
  const contentLabel = useContentLabel(categoryId);
  const { isFirstVote } = useOnboarding();
  const [amount, setAmount] = useState(5);
  const { address } = useAccount();
  const voterIdData = useVoterIdNFT(address);
  const hasVoterId = voterIdData.hasVoterId;
  const tokenId = voterIdData.tokenId as bigint;

  // Read current round for stake capacity check
  const { data: activeRoundIdData } = useScaffoldReadContract({
    contractName: "RoundVotingEngine" as any,
    functionName: "getActiveRoundId" as any,
    args: [contentId] as any,
  } as any);
  const currentRoundId = activeRoundIdData as bigint | undefined;

  // Get remaining stake capacity for this Voter ID on this content in this round
  const { remainingCapacity } = useVoterIdStake(contentId, currentRoundId, tokenId);

  // Read cREP balance
  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  const { data: tokenSymbol } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "symbol",
  });

  const symbol = tokenSymbol ?? "cREP";
  const { ratePercent, calculateBonus } = useParticipationRate();
  const voteBonus = calculateBonus(amount);

  // Format for 6 decimals; max stake = min(balance, remainingCapacity)
  const balanceFormatted = crepBalance ? Number(crepBalance) / 1e6 : 0;
  const capacityFormatted = Number(remainingCapacity) / 1e6;
  const maxByBalance = Math.floor(balanceFormatted);
  const maxByCapacity = Math.floor(capacityFormatted);
  const maxStake = Math.min(maxByBalance, maxByCapacity);
  const sliderMax = Math.max(1, maxStake);
  const isCapacityLimited = maxByCapacity < maxByBalance;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-label="Select stake amount"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel} />

          {/* Modal */}
          <motion.div
            className="relative bg-base-200 rounded-t-2xl sm:rounded-2xl w-full max-w-md p-6 border-t sm:border border-base-content/10 shadow-2xl"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            {/* Vote direction — same green/red as Voted Up / Voted Down */}
            <div className="text-center mb-5">
              <div
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-base font-semibold ${
                  isUp ? "bg-success/10 text-success" : "bg-error/10 text-error"
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {isUp ? <path d="M4.5 15.75l7.5-7.5 7.5 7.5" /> : <path d="M19.5 8.25l-7.5 7.5-7.5-7.5" />}
                </svg>
                {isUp ? "Rating goes UP" : "Rating goes DOWN"}
              </div>
            </div>

            {isFirstVote && (
              <div className="bg-info/10 border border-info/20 rounded-xl p-3 mb-4 text-sm text-base-content/70">
                Your stake is your confidence bet. Stake more cREP to earn more if your prediction is correct &mdash;
                but you&apos;ll lose your stake if you&apos;re wrong.
              </div>
            )}

            <h3 className="text-lg font-semibold text-center mb-3">
              How much to stake?
              <span
                className="inline-block ml-1.5 align-middle tooltip tooltip-bottom cursor-help"
                data-tip="You can only vote once per content per round. Choose your stake carefully!"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="opacity-50"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </span>
            </h3>

            <div className="text-base text-center text-base-content/40 mb-5 space-y-1">
              <p>
                Balance: {balanceFormatted.toLocaleString(undefined, { maximumFractionDigits: 0 })} {symbol}
              </p>
            </div>

            {/* Preset amounts */}
            <div className="flex flex-wrap gap-2 justify-center mb-5">
              {PRESET_AMOUNTS.filter(a => a <= maxStake).map(preset => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset)}
                  className={`px-4 py-2 rounded-lg text-base font-medium transition-colors ${
                    amount === preset
                      ? "bg-primary text-primary-content"
                      : "bg-base-200 text-base-content/60 hover:bg-base-300"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            {/* Slider */}
            <div className="px-1 mb-3">
              <input
                type="range"
                min={1}
                max={sliderMax}
                value={Math.min(amount, sliderMax)}
                onChange={e => setAmount(Number(e.target.value))}
                className="range range-primary range-sm w-full"
                disabled={maxStake < 1}
                aria-label="Stake amount"
              />
              <div className="flex justify-between text-base text-base-content/30 mt-1">
                <span>1</span>
                <span>{sliderMax}</span>
              </div>
            </div>

            {/* Amount display */}
            <div className="text-center my-5">
              <span className="text-4xl font-bold tabular-nums">{amount}</span>
              <span className="text-base text-base-content/40 ml-2">{symbol}</span>
              {isCapacityLimited && (
                <span
                  className="inline-block ml-2 align-middle tooltip tooltip-top cursor-help"
                  data-tip={`Max per ${contentLabel}: ${maxByCapacity} ${symbol} remaining (100 limit per round)`}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-60"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                </span>
              )}
            </div>

            {voteBonus !== undefined && voteBonus > 0 && (
              <p className="text-center text-sm text-emerald-400 -mt-3 mb-4">
                +{voteBonus.toLocaleString(undefined, { maximumFractionDigits: 1 })} {symbol} participation bonus (
                {ratePercent}%)
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="btn bg-base-300 flex-1 text-base-content hover:bg-base-300/80 border border-base-content/10"
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(amount)}
                className={`btn flex-1 text-white ${isUp ? "bg-success hover:bg-success/90" : "bg-error hover:bg-error/90"}`}
                disabled={!hasVoterId || amount < 1 || amount > maxStake || maxStake < 1}
              >
                Stake {amount} {symbol}
              </button>
            </div>

            {!hasVoterId && (
              <p className="text-center text-base text-warning mt-3">
                Voter ID required.{" "}
                <Link href="/governance" className="link link-primary">
                  Verify your identity to vote.
                </Link>
              </p>
            )}
            {hasVoterId && maxStake < 1 && maxByBalance < 1 && (
              <p className="text-center text-base text-error mt-3">
                Insufficient {symbol} balance.{" "}
                <Link href="/governance" className="link link-primary">
                  Get some from the faucet!
                </Link>
              </p>
            )}
            {hasVoterId && maxStake < 1 && maxByBalance >= 1 && maxByCapacity < 1 && (
              <p className="text-center text-base text-warning mt-3">
                You have reached the 100 {symbol} stake limit for this {contentLabel} this round.
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
