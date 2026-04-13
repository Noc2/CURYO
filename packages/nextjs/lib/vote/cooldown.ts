"use client";

export const VOTE_COOLDOWN_SECONDS = 24 * 60 * 60;

export function getVoteCooldownRemainingSeconds(committedAt: string, nowSeconds: number) {
  const committedSeconds = Math.floor(new Date(committedAt).getTime() / 1000);
  if (!Number.isFinite(committedSeconds)) return 0;
  return Math.max(0, committedSeconds + VOTE_COOLDOWN_SECONDS - nowSeconds);
}

interface VoteCooldownHistoryItem {
  contentId: bigint;
  committedAt: string | null;
}

export function getMaxVoteCooldownRemainingSeconds(
  votes: Iterable<VoteCooldownHistoryItem>,
  contentId: bigint | undefined,
  nowSeconds: number,
) {
  if (contentId === undefined) return 0;

  let cooldownSeconds = 0;
  for (const vote of votes) {
    if (vote.contentId !== contentId || !vote.committedAt) continue;

    const remainingSeconds = getVoteCooldownRemainingSeconds(vote.committedAt, nowSeconds);
    if (remainingSeconds > cooldownSeconds) {
      cooldownSeconds = remainingSeconds;
    }
  }

  return cooldownSeconds;
}

export function formatVoteCooldownRemaining(seconds: number) {
  if (seconds <= 0) return "less than a minute";

  const totalMinutes = Math.floor(seconds / 60);
  if (totalMinutes <= 0) return "less than a minute";

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
