import { isAddress } from "viem";
import { normalizeAvatarAccentHex } from "~~/lib/avatar/avatarAccent";
import { renderOrbitalAvatarSvg } from "~~/lib/avatar/orbitalAvatar";
import type { ReputationAvatarPayload } from "~~/lib/avatar/avatarPayload";

const EMPTY_REPUTATION_AVATAR_STREAK: ReputationAvatarPayload["streak"] = {
  currentDailyStreak: 0,
  bestDailyStreak: 0,
  totalActiveDays: 0,
  lastActiveDate: null,
  lastMilestoneDay: 0,
};

function createEmptyReputationAvatarPayload(
  address: string,
  avatarAccentHex?: string | null,
): ReputationAvatarPayload | null {
  if (!isAddress(address)) {
    return null;
  }

  return {
    address: address.toLowerCase(),
    balance: "0",
    avatarAccentHex: normalizeAvatarAccentHex(avatarAccentHex),
    voterId: null,
    stats: null,
    streak: EMPTY_REPUTATION_AVATAR_STREAK,
    categories90d: [],
  };
}

export function getReputationAvatarUrl(
  address: string | null | undefined,
  size?: number,
  avatarAccentHex?: string | null,
): string | null {
  if (!address || !isAddress(address)) {
    return null;
  }

  const url = new URLSearchParams({
    address: address.toLowerCase(),
  });

  if (size !== undefined && Number.isFinite(size)) {
    url.set("size", String(Math.round(size)));
  }

  const normalizedAccentHex = normalizeAvatarAccentHex(avatarAccentHex);
  if (normalizedAccentHex) {
    url.set("accent", normalizedAccentHex.slice(1));
  }

  return `/api/reputation-avatar?${url.toString()}`;
}

export function getFallbackReputationAvatarDataUrl(
  address: string | null | undefined,
  size?: number,
  avatarAccentHex?: string | null,
): string | null {
  if (!address) {
    return null;
  }

  const payload = createEmptyReputationAvatarPayload(address, avatarAccentHex);
  if (!payload) {
    return null;
  }

  const svg = renderOrbitalAvatarSvg(payload, { size });
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
