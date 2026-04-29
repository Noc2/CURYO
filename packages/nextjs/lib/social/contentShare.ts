import { clampContentRating, formatRatingScoreOutOfTen } from "../ui/ratingDisplay";
import { RATE_ROUTE } from "~~/constants/routes";
import { detectPlatform, getThumbnailUrl } from "~~/utils/platforms";

export const VOTE_SHARE_RATING_VERSION_PARAM = "rv";

const TITLE_MAX_LENGTH = 96;
const DESCRIPTION_MAX_LENGTH = 180;
const ALT_MAX_LENGTH = 180;
const ALLOWED_SHARE_IMAGE_HOSTS = new Set(["i.ytimg.com", "img.youtube.com"]);

export type ContentShareRatingSource = "open_round_reference" | "content_rating_bps" | "content_rating";

export interface ContentShareContentInput {
  id: string;
  url?: string | null;
  title: string;
  description: string;
  rating: number;
  ratingBps?: number;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
  contentMetadata?: {
    thumbnailUrl?: string | null;
    imageUrl?: string | null;
  } | null;
  totalVotes?: number;
  lastActivityAt?: string | null;
  openRound?: {
    referenceRatingBps?: number;
    voteCount?: number;
  } | null;
}

export interface ContentShareRating {
  rating: number;
  ratingBps: number;
  label: string;
  source: ContentShareRatingSource;
}

export interface ContentShareData {
  contentId: string;
  contentUrl: string;
  contentTitle: string;
  contentDescription: string;
  contentImageUrl: string | null;
  title: string;
  description: string;
  imageAlt: string;
  rating: ContentShareRating;
  ratingVersion: string;
  totalVotes: number;
  openRoundVoteCount: number;
  shareUrl: string;
  imageUrl: string;
}

function normalizeSpace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function truncateText(value: string, maxLength: number): string {
  const normalized = normalizeSpace(value);
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeFiniteInteger(value: number | undefined, fallback = 0): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.round(value));
}

function normalizeRatingBps(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(10_000, Math.max(0, Math.round(value)));
}

function normalizeActivitySeconds(value: string | null | undefined): number {
  const trimmed = value?.trim();
  if (!trimmed) return 0;

  if (/^\d+$/.test(trimmed)) {
    const timestamp = Number(trimmed);
    if (!Number.isFinite(timestamp) || timestamp < 0) return 0;

    return Math.floor(timestamp > 10_000_000_000 ? timestamp / 1000 : timestamp);
  }

  const activityMs = Date.parse(trimmed);
  return Number.isFinite(activityMs) ? Math.floor(activityMs / 1000) : 0;
}

function normalizeHttpsImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || !ALLOWED_SHARE_IMAGE_HOSTS.has(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function getPlatformShareImageUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;

  const platform = detectPlatform(trimmed);
  const thumbnailUrl = getThumbnailUrl(trimmed, platform.type === "youtube" ? "hqdefault" : undefined);
  return normalizeHttpsImageUrl(thumbnailUrl);
}

export function resolveContentShareImageUrl(content: ContentShareContentInput): string | null {
  const candidates = [
    content.imageUrl,
    content.thumbnailUrl,
    content.contentMetadata?.imageUrl,
    content.contentMetadata?.thumbnailUrl,
    getPlatformShareImageUrl(content.url),
  ];

  for (const candidate of candidates) {
    const imageUrl = normalizeHttpsImageUrl(candidate);
    if (imageUrl) return imageUrl;
  }

  return null;
}

export function normalizeContentShareContentId(value: unknown): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return null;

  const normalized = candidate.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const id = BigInt(normalized);
  return id > 0n ? id.toString() : null;
}

export function resolveContentShareRating(content: ContentShareContentInput): ContentShareRating {
  const referenceRatingBps = normalizeRatingBps(content.openRound?.referenceRatingBps);
  const contentRatingBps = normalizeRatingBps(content.ratingBps);
  const ratingBps =
    referenceRatingBps ?? contentRatingBps ?? Math.round(clampContentRating(Number(content.rating)) * 100);
  const source: ContentShareRatingSource =
    referenceRatingBps !== null
      ? "open_round_reference"
      : contentRatingBps !== null
        ? "content_rating_bps"
        : "content_rating";
  const rating = ratingBps / 100;

  return {
    rating,
    ratingBps,
    label: formatRatingScoreOutOfTen(rating),
    source,
  };
}

export function buildContentShareRatingVersion(
  content: ContentShareContentInput,
  rating = resolveContentShareRating(content),
): string {
  const activitySeconds = normalizeActivitySeconds(content.lastActivityAt);
  const totalVotes = normalizeFiniteInteger(content.totalVotes);
  const openRoundVoteCount = normalizeFiniteInteger(content.openRound?.voteCount);

  return `r-${content.id}-${rating.ratingBps}-${totalVotes}-${openRoundVoteCount}-${activitySeconds}`;
}

function buildVoteShareUrl(origin: string, contentId: string, ratingVersion?: string): string {
  const url = new URL(RATE_ROUTE, `${origin.replace(/\/+$/, "")}/`);
  url.searchParams.set("content", contentId);
  if (ratingVersion) {
    url.searchParams.set(VOTE_SHARE_RATING_VERSION_PARAM, ratingVersion);
  }
  return url.toString();
}

function buildVoteShareImageUrl(origin: string, contentId: string, ratingVersion: string): string {
  const url = new URL("/api/og/vote", `${origin.replace(/\/+$/, "")}/`);
  url.searchParams.set("content", contentId);
  url.searchParams.set(VOTE_SHARE_RATING_VERSION_PARAM, ratingVersion);
  return url.toString();
}

export function buildContentShareData(content: ContentShareContentInput, origin: string): ContentShareData {
  const contentTitle = truncateText(content.title || `Content #${content.id}`, TITLE_MAX_LENGTH);
  const contentDescription = truncateText(content.description, DESCRIPTION_MAX_LENGTH);
  const contentUrl = content.url?.trim() ?? "";
  const contentImageUrl = resolveContentShareImageUrl(content);
  const rating = resolveContentShareRating(content);
  const ratingVersion = buildContentShareRatingVersion(content, rating);
  const totalVotes = normalizeFiniteInteger(content.totalVotes);
  const openRoundVoteCount = normalizeFiniteInteger(content.openRound?.voteCount);
  const voteLabel = `${totalVotes} vote${totalVotes === 1 ? "" : "s"}`;
  const title = truncateText(`Rated ${rating.label}/10 on Curyo: ${contentTitle}`, TITLE_MAX_LENGTH);
  const description = truncateText(
    `Current rating ${rating.label}/10 from ${voteLabel}. Disagree? Stake HREP and vote.`,
    DESCRIPTION_MAX_LENGTH,
  );
  const imageAlt = truncateText(
    `Curyo social card for ${contentTitle}, showing a current rating of ${rating.label} out of 10.`,
    ALT_MAX_LENGTH,
  );

  return {
    contentId: content.id,
    contentUrl,
    contentTitle,
    contentDescription,
    contentImageUrl,
    title,
    description,
    imageAlt,
    rating,
    ratingVersion,
    totalVotes,
    openRoundVoteCount,
    shareUrl: buildVoteShareUrl(origin, content.id, ratingVersion),
    imageUrl: buildVoteShareImageUrl(origin, content.id, ratingVersion),
  };
}
