import { isAddress } from "viem";
import { normalizeAvatarAccentHex } from "~~/lib/avatar/avatarAccent";
import { sanitizeExternalUrl } from "~~/utils/externalUrl";

export function getProxiedProfileImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  const safeUrl = sanitizeExternalUrl(imageUrl);
  if (!safeUrl) {
    return null;
  }

  return `/api/profile-image?url=${encodeURIComponent(safeUrl)}`;
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
