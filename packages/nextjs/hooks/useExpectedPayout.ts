"use client";

import { useParticipationRate } from "~~/hooks/useParticipationRate";
import { useRoundInfo } from "~~/hooks/useRoundInfo";

interface ExpectedPayout {
  potentialWinUp: bigint; // net gain if voting UP wins
  potentialWinDown: bigint; // net gain if voting DOWN wins
  potentialLoss: bigint; // stake amount (what you lose)
  participationBonus: bigint; // participation pool bonus
}

/**
 * Estimate potential win/loss for a given stake on the current round.
 * During epoch 1, pools are hidden (tlock) so estimates return 0.
 * After reveals, uses parimutuel formula: 82% of losing pool to voters.
 */
export function useExpectedPayout(contentId?: bigint, stakeAmount?: bigint): ExpectedPayout {
  const { round } = useRoundInfo(contentId);
  const { rateBps } = useParticipationRate();

  const stake = stakeAmount ?? 0n;
  const isOpen = round?.state === 0 && (round?.startTime ?? 0) > 0;

  // Participation bonus: stake * rateBps / 10000
  const participationBonus = rateBps !== undefined ? (stake * BigInt(rateBps)) / 10000n : 0n;

  if (!isOpen || stake === 0n) {
    return { potentialWinUp: 0n, potentialWinDown: 0n, potentialLoss: stake, participationBonus: 0n };
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
    potentialWinUp: calcWin(upPool, downPool) + participationBonus,
    potentialWinDown: calcWin(downPool, upPool) + participationBonus,
    potentialLoss: stake,
    participationBonus,
  };
}
