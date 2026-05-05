import { sanitizeExternalUrl } from "~~/utils/externalUrl";
import { canonicalizeUrl, detectPlatform } from "~~/utils/platforms";

export const MAX_SUBMISSION_IMAGE_URLS = 4;
export const MAX_SUBMISSION_URL_LENGTH = 2048;

const DIRECT_IMAGE_URL_PATTERN = /^https:\/\/.+\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;
const CURYO_IMAGE_ATTACHMENT_PATH_PATTERN = /^\/api\/attachments\/images\/att_[A-Za-z0-9_-]{16,80}\.webp$/;

export type ContentMediaType = "image" | "video";

export interface ContentMediaItem {
  mediaIndex: number;
  mediaType: ContentMediaType;
  url: string;
  canonicalUrl?: string | null;
  urlHost?: string | null;
}

export function isDirectImageUrl(url: string): boolean {
  return DIRECT_IMAGE_URL_PATTERN.test(url) || Boolean(normalizeCuryoHostedImageUrl(url));
}

export function isYouTubeVideoUrl(url: string): boolean {
  return detectPlatform(url).type === "youtube";
}

function getContentMediaType(url: string): ContentMediaType | null {
  if (isDirectImageUrl(url)) return "image";
  if (isYouTubeVideoUrl(url)) return "video";
  return null;
}

export function normalizeSubmissionMediaUrl(value: string): string | null {
  const sanitizedUrl = sanitizeExternalUrl(value);
  if (sanitizedUrl) return canonicalizeUrl(sanitizedUrl);
  return normalizeCuryoHostedImageUrl(value);
}

export function normalizeSubmissionContextUrl(value: string): string | null {
  const sanitizedUrl = sanitizeExternalUrl(value);
  if (!sanitizedUrl) return null;
  return canonicalizeUrl(sanitizedUrl);
}

function normalizeCuryoHostedImageUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.username || parsed.password) return null;
    if (!CURYO_IMAGE_ATTACHMENT_PATH_PATTERN.test(parsed.pathname)) return null;
    if (parsed.protocol === "https:") return parsed.toString();
    if (parsed.protocol === "http:" && ["localhost", "127.0.0.1", "::1", "[::1]"].includes(parsed.hostname)) {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function buildFallbackMediaItems(url: string | null | undefined): ContentMediaItem[] {
  const trimmedUrl = url?.trim();
  if (!trimmedUrl) return [];

  const mediaType = getContentMediaType(trimmedUrl);
  if (!mediaType) return [];

  return [
    {
      mediaIndex: 0,
      mediaType,
      url: trimmedUrl,
    },
  ];
}
