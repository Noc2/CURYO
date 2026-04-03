"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { EPOCH_WEIGHT_BPS } from "@curyo/contracts/protocol";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "wagmi";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";
import { useContentLabel } from "~~/hooks/useCategoryRegistry";
import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useRoundSnapshot } from "~~/hooks/useRoundSnapshot";
import { useVoterIdNFT, useVoterIdStake } from "~~/hooks/useVoterIdNFT";
import { getSubmittingTransactionMessage } from "~~/lib/ui/transactionStatusCopy";
import { formatVoteCooldownRemaining } from "~~/lib/vote/cooldown";
import { estimateVoteReturn, formatCrepAmount } from "~~/lib/vote/voteIncentives";

interface StakeSelectorProps {
  isOpen: boolean;
  isUp: boolean;
  contentId: bigint;
  categoryId?: bigint;
  cooldownSecondsRemaining?: number;
  isConfirming?: boolean;
  confirmError?: string | null;
  onConfirm: (stakeAmount: number) => void;
  onCancel: () => void;
}

const PRESET_AMOUNTS = [1, 5, 25, 50, 100];

/**
 * Bottom-sheet modal to select stake amount before committing a vote.
 */
export function StakeSelector({
  isOpen,
  isUp,
  contentId,
  categoryId,
  cooldownSecondsRemaining = 0,
  isConfirming = false,
  confirmError = null,
  onConfirm,
  onCancel,
}: StakeSelectorProps) {
  const contentLabel = useContentLabel(categoryId);
  const [amount, setAmount] = useState(5);
  const { address } = useAccount();
  const voterIdData = useVoterIdNFT(address);
  const hasVoterId = voterIdData.hasVoterId;
  const tokenId = voterIdData.tokenId as bigint;

  const roundSnapshot = useRoundSnapshot(contentId);
  const { roundId: currentRoundId, phase, isEpoch1, upPool, downPool } = roundSnapshot;
  const effectiveIsBlind = phase !== "voting" || isEpoch1;

  const estimateSnapshot = useMemo(
    () => ({
      ...roundSnapshot,
      isEpoch1: effectiveIsBlind,
    }),
    [effectiveIsBlind, roundSnapshot],
  );

  const { remainingCapacity } = useVoterIdStake(contentId, currentRoundId, tokenId);

  const { data: crepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  const { data: tokenSymbol } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "symbol",
  });

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isConfirming) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isConfirming, isOpen, onCancel]);

  const symbol = tokenSymbol ?? "cREP";
  const { calculateBonus } = useParticipationRate();
  const voteBonus = calculateBonus(amount);
  const voteEstimate = estimateVoteReturn(estimateSnapshot, isUp, amount);

  const balanceFormatted = crepBalance ? Number(crepBalance) / 1e6 : 0;
  const capacityFormatted = remainingCapacity != null ? Number(remainingCapacity) / 1e6 : 100;
  const maxByBalance = Math.floor(balanceFormatted);
  const maxByCapacity = Math.floor(capacityFormatted);
  const maxStake = Math.min(maxByBalance, maxByCapacity);
  const sliderMax = Math.max(1, maxStake);
  const isCapacityLimited = maxByCapacity < maxByBalance;
  const cooldownActive = cooldownSecondsRemaining > 0;
  const cooldownLabel = formatVoteCooldownRemaining(cooldownSecondsRemaining);
  const confirmDisabled =
    isConfirming || !hasVoterId || cooldownActive || amount < 1 || amount > maxStake || maxStake < 1;
  const phaseHeadline = effectiveIsBlind ? "Blind phase" : "Open phase";
  const phaseToneClassName = isUp ? (effectiveIsBlind ? "bg-primary/10" : "bg-warning/10") : "bg-error/10";
  const phaseHeadlineClassName = isUp ? (effectiveIsBlind ? "text-primary" : "text-warning") : "text-error";
  const selectedPresetClassName = isUp ? "bg-primary text-primary-content" : "bg-error text-primary-content";
  const sliderClassName = `range ${isUp ? "range-primary" : "range-error"} range-sm w-full`;
  const sliderStyle = { "--range-thumb": "var(--curyo-warm-white)" } as CSSProperties;
  const weightPercent = Math.round(
    (effectiveIsBlind ? EPOCH_WEIGHT_BPS.blind : EPOCH_WEIGHT_BPS.informed) / 100,
  ).toLocaleString();
  const participationBonusMicro = voteBonus !== undefined ? BigInt(Math.round(voteBonus * 1e6)) : null;
  const openPhaseGrossReturnMicro =
    participationBonusMicro !== null ? voteEstimate.estimatedGrossReturnMicro + participationBonusMicro : null;
  const openPhaseRevealedRefundMicro =
    participationBonusMicro !== null ? voteEstimate.revealedLoserRefundMicro + participationBonusMicro : null;
  const openPhaseParticipationTooltip =
    voteBonus !== undefined
      ? `Includes the current participation bonus of +${voteBonus.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${symbol}.`
      : "Includes the current participation bonus once it finishes loading.";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label="Select stake amount"
          aria-busy={isConfirming}
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={isConfirming ? undefined : onCancel}
          />

          <motion.div
            className="relative w-full max-w-md rounded-t-2xl bg-base-200 p-6 shadow-2xl sm:rounded-2xl"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
          >
            <div className="mb-5 text-center">
              <div
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-base font-semibold ${
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
                {isUp ? "Rating goes up" : "Rating goes down"}
              </div>
            </div>

            <h3 className="mb-3 text-center text-lg font-semibold">
              How much to stake?
              <span
                className="tooltip tooltip-bottom ml-1.5 inline-block cursor-help align-middle"
                data-tip="You can only vote once per content per round. Choose your stake carefully!"
                role="img"
                aria-label="You can only vote once per content per round. Choose your stake carefully!"
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
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 16v-4" />
                  <path d="M12 8h.01" />
                </svg>
              </span>
            </h3>

            <div className="mb-5 space-y-1 text-center text-base text-base-content/40">
              <p>
                Balance: {balanceFormatted.toLocaleString(undefined, { maximumFractionDigits: 0 })} {symbol}
              </p>
            </div>

            <div className="mb-5 flex flex-wrap justify-center gap-2">
              {PRESET_AMOUNTS.filter(a => a <= maxStake).map(preset => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset)}
                  className={`rounded-lg px-4 py-2 text-base font-medium transition-colors ${
                    amount === preset ? selectedPresetClassName : "pill-inactive-muted"
                  }`}
                  disabled={isConfirming}
                >
                  {preset}
                </button>
              ))}
            </div>

            <div className="mb-3 px-1">
              <input
                type="range"
                min={1}
                max={sliderMax}
                value={Math.min(amount, sliderMax)}
                onChange={e => setAmount(Number(e.target.value))}
                className={sliderClassName}
                style={sliderStyle}
                disabled={isConfirming || maxStake < 1}
                aria-label="Stake amount"
              />
              <div className="mt-1 flex justify-between text-base text-base-content/30">
                <span>1</span>
                <span>{sliderMax}</span>
              </div>
            </div>

            <div className="my-5 text-center">
              <span className="text-4xl font-bold tabular-nums">{amount}</span>
              <span className="ml-2 text-base text-base-content/40">{symbol}</span>
              {isCapacityLimited && (
                <span
                  className="tooltip tooltip-top ml-2 inline-block cursor-help align-middle"
                  data-tip={`Max per ${contentLabel}: ${maxByCapacity} ${symbol} remaining (100 limit per round)`}
                  role="img"
                  aria-label={`Max per ${contentLabel}: ${maxByCapacity} ${symbol} remaining (100 limit per round)`}
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
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                </span>
              )}
            </div>

            <div className={`mb-4 rounded-2xl px-4 py-3 ${phaseToneClassName}`}>
              <div className="flex items-center gap-1.5">
                <p className={`text-sm font-semibold ${phaseHeadlineClassName}`}>{phaseHeadline}</p>
                {!effectiveIsBlind && <InfoTooltip text={openPhaseParticipationTooltip} position="bottom" />}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-base-content/80">
                {effectiveIsBlind ? (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span>Participation bonus</span>
                      <span className="font-semibold tabular-nums">
                        {voteBonus !== undefined
                          ? `+${voteBonus.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${symbol}`
                          : "Loading"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Reward weight</span>
                      <span className="font-semibold tabular-nums">{weightPercent}% (4x vs open)</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span>Est. return if right</span>
                      <span className="font-semibold tabular-nums">
                        {openPhaseGrossReturnMicro !== null
                          ? `${formatCrepAmount(openPhaseGrossReturnMicro)} ${symbol}`
                          : "Loading"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>If wrong but revealed</span>
                      <span className="font-semibold tabular-nums">
                        {openPhaseRevealedRefundMicro !== null
                          ? `${formatCrepAmount(openPhaseRevealedRefundMicro)} ${symbol}`
                          : "Loading"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Live pools</span>
                      <span className="font-semibold tabular-nums">
                        up {formatCrepAmount(upPool, 0)} · down {formatCrepAmount(downPool, 0)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {isConfirming && (
              <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-center text-sm text-primary">
                <div className="flex items-center justify-center gap-2">
                  <span className="loading loading-spinner loading-xs" />
                  <span>{getSubmittingTransactionMessage("vote")}</span>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="btn flex-1 border border-base-content/10 bg-base-300 text-base-content hover:bg-base-300/80"
                disabled={isConfirming}
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm(amount)}
                className={`btn flex-1 text-primary-content ${isUp ? "bg-success hover:bg-success/90" : "bg-error hover:bg-error/90"}`}
                disabled={confirmDisabled}
              >
                {isConfirming ? (
                  <span className="flex items-center gap-2">
                    <span className="loading loading-spinner loading-xs" />
                    <span>Submitting...</span>
                  </span>
                ) : (
                  `Stake ${amount} ${symbol}`
                )}
              </button>
            </div>

            {confirmError && !isConfirming && <p className="mt-3 text-center text-base text-error">{confirmError}</p>}

            {cooldownActive && (
              <p className="mt-3 text-center text-base text-warning">
                You already voted on this content recently. Try again in {cooldownLabel}.
              </p>
            )}
            {!hasVoterId && (
              <p className="mt-3 text-center text-base text-warning">
                Voter ID required.{" "}
                <Link href="/governance" className="link link-primary">
                  Verify your identity to vote.
                </Link>
              </p>
            )}
            {hasVoterId && maxStake < 1 && maxByBalance < 1 && (
              <p className="mt-3 text-center text-base text-error">
                Insufficient {symbol} balance.{" "}
                <Link href="/governance" className="link link-primary">
                  Get some from the faucet!
                </Link>
              </p>
            )}
            {hasVoterId && maxStake < 1 && maxByBalance >= 1 && maxByCapacity < 1 && (
              <p className="mt-3 text-center text-base text-warning">
                You have reached the 100 {symbol} stake limit for this {contentLabel} this round.
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
