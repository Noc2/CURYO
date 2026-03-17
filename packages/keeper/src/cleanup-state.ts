import { RoundState } from "./round-data.js";

export interface CleanupCursor {
  contentId: bigint;
  roundId: bigint;
  nextIndex: number;
}

export const MAX_CLEANUP_BATCHES_PER_TICK = 4;
const MAX_CLEANUP_COMPLETED = 5000;
const cleanupQueue = new Map<string, CleanupCursor>();
const cleanupCompletedRounds = new Set<string>();
const cleanupDiscoveryRoundByContent = new Map<bigint, bigint>();

export function resetKeeperStateForTests(): void {
  cleanupQueue.clear();
  cleanupCompletedRounds.clear();
  cleanupDiscoveryRoundByContent.clear();
}

export function cleanupRoundKey(contentId: bigint, roundId: bigint): string {
  return `${contentId}:${roundId}`;
}

export function isCleanupEligibleRoundState(state: number): boolean {
  return state === RoundState.Settled || state === RoundState.Tied || state === RoundState.RevealFailed;
}

export function advanceCleanupDiscoveryRound(contentId: bigint, latestRoundId: bigint): bigint | null {
  if (latestRoundId === 0n) {
    cleanupDiscoveryRoundByContent.delete(contentId);
    return null;
  }

  let roundId = cleanupDiscoveryRoundByContent.get(contentId) ?? 1n;
  if (roundId > latestRoundId) {
    roundId = 1n;
  }

  cleanupDiscoveryRoundByContent.set(contentId, roundId >= latestRoundId ? 1n : roundId + 1n);
  return roundId;
}

export function hasQueuedOrCompletedCleanup(contentId: bigint, roundId: bigint): boolean {
  const key = cleanupRoundKey(contentId, roundId);
  return cleanupCompletedRounds.has(key) || cleanupQueue.has(key);
}

export function enqueueRoundForCleanup(contentId: bigint, roundId: bigint, startIndex = 0): void {
  const key = cleanupRoundKey(contentId, roundId);
  if (cleanupCompletedRounds.has(key)) return;

  const existing = cleanupQueue.get(key);
  if (existing) {
    existing.nextIndex = Math.min(existing.nextIndex, startIndex);
    return;
  }

  cleanupQueue.set(key, { contentId, roundId, nextIndex: startIndex });
}

export function listQueuedCleanupRounds(): CleanupCursor[] {
  return Array.from(cleanupQueue.values());
}

export function removeQueuedCleanupRound(contentId: bigint, roundId: bigint): void {
  cleanupQueue.delete(cleanupRoundKey(contentId, roundId));
}

export function markCleanupCompleted(contentId: bigint, roundId: bigint): void {
  const key = cleanupRoundKey(contentId, roundId);
  cleanupQueue.delete(key);
  cleanupCompletedRounds.add(key);

  if (cleanupCompletedRounds.size > MAX_CLEANUP_COMPLETED) {
    const entries = Array.from(cleanupCompletedRounds);
    const toRemove = entries.slice(0, entries.length - MAX_CLEANUP_COMPLETED);
    for (const entry of toRemove) {
      cleanupCompletedRounds.delete(entry);
    }
  }
}
