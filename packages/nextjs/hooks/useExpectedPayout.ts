"use client";

import { useRoundInfo } from "~~/hooks/useRoundInfo";

interface ExpectedPayout {
  potentialWinUp: bigint; // net gain if voting UP wins
  potentialWinDown: bigint; // net gain if voting DOWN wins
  potentialLoss: bigint; // stake amount (what you lose)
}

/**
 * Estimate potential win/loss for a given stake on the current round.
 * During epoch 1, pools are hidden (tlock) so estimates return 0.
 * After reveals, uses parimutuel formula: 82% of losing pool to voters.
 */
export function useExpectedPayout(contentId?: bigint, stakeAmount?: bigint): ExpectedPayout {
  const { round } = useRoundInfo(contentId);

  const stake = stakeAmount ?? 0n;
  const isOpen = round?.state === 0 && (round?.startTime ?? 0) > 0;

  if (!isOpen || stake === 0n) {
    return { potentialWinUp: 0n, potentialWinDown: 0n, potentialLoss: stake };
  }

  const upPool = round?.upPool ?? 0n;
  const downPool = round?.downPool ?? 0n;

  // Parimutuel: 82% of losing pool goes to voters on winning side
  // potentialWin = (myStake / winningPool) * voterPool
  const calcWin = (winPool: bigint, losePool: bigint): bigint => {
    if (winPool === 0n && losePool === 0n) return 0n;
    const totalWinPool = winPool + stake;
    const voterPool = (losePool * 82n) / 100n;
    if (totalWinPool === 0n) return 0n;
    return (stake * voterPool) / totalWinPool;
  };

  return {
    potentialWinUp: calcWin(upPool, downPool),
    potentialWinDown: calcWin(downPool, upPool),
    potentialLoss: stake,
  };
}
