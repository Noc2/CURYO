"use client";

export const VOTE_COOLDOWN_SECONDS = 24 * 60 * 60;

export function getVoteCooldownRemainingSeconds(committedAt: string, nowSeconds: number) {
  const committedSeconds = Math.floor(new Date(committedAt).getTime() / 1000);
  if (!Number.isFinite(committedSeconds)) return 0;
  return Math.max(0, committedSeconds + VOTE_COOLDOWN_SECONDS - nowSeconds);
}

export function formatVoteCooldownRemaining(seconds: number) {
  if (seconds <= 0) return "less than a minute";

  const totalMinutes = Math.ceil(seconds / 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
