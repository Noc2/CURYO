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
