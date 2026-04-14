import { clampContentRating, formatRatingScoreOutOfTen } from "../ui/ratingDisplay";

export const VOTE_SHARE_RATING_VERSION_PARAM = "rv";

const TITLE_MAX_LENGTH = 96;
const DESCRIPTION_MAX_LENGTH = 180;
const ALT_MAX_LENGTH = 180;

export type ContentShareRatingSource = "open_round_reference" | "content_rating_bps" | "content_rating";

export interface ContentShareContentInput {
  id: string;
  title: string;
  description: string;
  rating: number;
  ratingBps?: number;
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
  contentTitle: string;
  contentDescription: string;
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
  const activityMs = content.lastActivityAt ? Date.parse(content.lastActivityAt) : Number.NaN;
  const activitySeconds = Number.isFinite(activityMs) ? Math.floor(activityMs / 1000) : 0;
  const totalVotes = normalizeFiniteInteger(content.totalVotes);
  const openRoundVoteCount = normalizeFiniteInteger(content.openRound?.voteCount);

  return `r-${content.id}-${rating.ratingBps}-${totalVotes}-${openRoundVoteCount}-${activitySeconds}`;
}

export function buildVoteShareUrl(origin: string, contentId: string, ratingVersion?: string): string {
  const url = new URL("/vote", `${origin.replace(/\/+$/, "")}/`);
  url.searchParams.set("content", contentId);
  if (ratingVersion) {
    url.searchParams.set(VOTE_SHARE_RATING_VERSION_PARAM, ratingVersion);
  }
  return url.toString();
}

export function buildVoteShareImageUrl(origin: string, contentId: string, ratingVersion: string): string {
  const url = new URL("/api/og/vote", `${origin.replace(/\/+$/, "")}/`);
  url.searchParams.set("content", contentId);
  url.searchParams.set(VOTE_SHARE_RATING_VERSION_PARAM, ratingVersion);
  return url.toString();
}

export function buildContentShareData(content: ContentShareContentInput, origin: string): ContentShareData {
  const contentTitle = truncateText(content.title || `Content #${content.id}`, TITLE_MAX_LENGTH);
  const contentDescription = truncateText(content.description, DESCRIPTION_MAX_LENGTH);
  const rating = resolveContentShareRating(content);
  const ratingVersion = buildContentShareRatingVersion(content, rating);
  const totalVotes = normalizeFiniteInteger(content.totalVotes);
  const openRoundVoteCount = normalizeFiniteInteger(content.openRound?.voteCount);
  const voteLabel = `${totalVotes} vote${totalVotes === 1 ? "" : "s"}`;
  const title = truncateText(`Rated ${rating.label}/10 on Curyo: ${contentTitle}`, TITLE_MAX_LENGTH);
  const description = truncateText(
    `Current rating ${rating.label}/10 from ${voteLabel}. Disagree? Stake cREP and vote.`,
    DESCRIPTION_MAX_LENGTH,
  );
  const imageAlt = truncateText(
    `Curyo social card for ${contentTitle}, showing a current rating of ${rating.label} out of 10.`,
    ALT_MAX_LENGTH,
  );

  return {
    contentId: content.id,
    contentTitle,
    contentDescription,
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
