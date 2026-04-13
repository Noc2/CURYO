"use client";

export const VOTE_COOLDOWN_SECONDS = 24 * 60 * 60;

function getUnixSecondsFromNumericTimestamp(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return Math.floor(timestamp > 1_000_000_000_000 ? timestamp / 1000 : timestamp);
}

export function getVoteCommittedSeconds(committedAt: string | number | bigint | null | undefined) {
  if (committedAt === null || committedAt === undefined) return null;

  if (typeof committedAt === "bigint") {
    return getUnixSecondsFromNumericTimestamp(Number(committedAt));
  }

  if (typeof committedAt === "number") {
    return getUnixSecondsFromNumericTimestamp(committedAt);
  }

  const trimmed = committedAt.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    return getUnixSecondsFromNumericTimestamp(Number(trimmed));
  }

  const committedSeconds = Math.floor(Date.parse(trimmed) / 1000);
  return Number.isFinite(committedSeconds) ? committedSeconds : null;
}

export function normalizeVoteCommittedAt(committedAt: string | number | bigint | null | undefined) {
  const committedSeconds = getVoteCommittedSeconds(committedAt);
  return committedSeconds === null ? null : new Date(committedSeconds * 1000).toISOString();
}

export function getVoteCooldownRemainingSeconds(
  committedAt: string | number | bigint | null | undefined,
  nowSeconds: number,
) {
  const committedSeconds = getVoteCommittedSeconds(committedAt);
  if (committedSeconds === null) return 0;
  return Math.max(0, committedSeconds + VOTE_COOLDOWN_SECONDS - nowSeconds);
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
