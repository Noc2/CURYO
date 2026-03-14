import { isAddress } from "viem";
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

export function getReputationAvatarUrl(address: string | null | undefined, size?: number): string | null {
  if (!address || !isAddress(address)) {
    return null;
  }

  const url = new URLSearchParams({
    address: address.toLowerCase(),
  });

  if (size !== undefined && Number.isFinite(size)) {
    url.set("size", String(Math.round(size)));
  }

  return `/api/reputation-avatar?${url.toString()}`;
}
