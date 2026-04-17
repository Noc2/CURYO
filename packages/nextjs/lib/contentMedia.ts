"use client";

import { sanitizeExternalUrl } from "~~/utils/externalUrl";
import { canonicalizeUrl, detectPlatform } from "~~/utils/platforms";

export const MAX_SUBMISSION_IMAGE_URLS = 4;

const DIRECT_IMAGE_URL_PATTERN = /^https:\/\/.+\.(?:avif|gif|jpe?g|png|webp)(?:[?#].*)?$/i;

export type ContentMediaType = "image" | "video";

export interface ContentMediaItem {
  mediaIndex: number;
  mediaType: ContentMediaType;
  url: string;
  canonicalUrl?: string | null;
  urlHost?: string | null;
}

export function isDirectImageUrl(url: string): boolean {
  return DIRECT_IMAGE_URL_PATTERN.test(url);
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
  if (!sanitizedUrl) return null;
  return canonicalizeUrl(sanitizedUrl);
}

export function normalizeSubmissionContextUrl(value: string): string | null {
  const sanitizedUrl = sanitizeExternalUrl(value);
  if (!sanitizedUrl) return null;
  return canonicalizeUrl(sanitizedUrl);
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
