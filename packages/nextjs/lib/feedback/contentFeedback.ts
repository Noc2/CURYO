import { ROUND_STATE, type RoundState } from "@curyo/contracts/protocol";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "~~/lib/db";
import { contentFeedback } from "~~/lib/db/schema";
import {
  CONTENT_FEEDBACK_BODY_MAX_LENGTH,
  CONTENT_FEEDBACK_SOURCE_URL_MAX_LENGTH,
  CONTENT_FEEDBACK_TYPES,
  CONTENT_FEEDBACK_TYPE_LABELS,
  type ContentFeedbackItem,
  type ContentFeedbackListResult,
  type ContentFeedbackType,
} from "~~/lib/feedback/types";
import { isValidWalletAddress, normalizeContentId, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";
import { ponderApi } from "~~/services/ponder/client";
import { containsBlockedText, containsBlockedUrl } from "~~/utils/contentFilter";

const CONTENT_FEEDBACK_LIST_LIMIT = 100;
const APPROVED_MODERATION_STATUS = "approved";
const HIDDEN_UNTIL_SETTLEMENT_STATUS = "hidden_until_settlement";

export interface NormalizedContentFeedbackInput {
  normalizedAddress: `0x${string}`;
  contentId: string;
  feedbackType: ContentFeedbackType;
  body: string;
  sourceUrl: string | null;
}

export interface NormalizedContentFeedbackReadInput {
  contentId: string;
  normalizedAddress: `0x${string}` | null;
}

export interface ContentFeedbackRoundContext {
  openRoundId: string | null;
  currentRoundId: string | null;
  terminalRoundIds: Set<string>;
  settlementComplete: boolean;
}

type FeedbackRow = typeof contentFeedback.$inferSelect;

export class ContentFeedbackStorageUnavailableError extends Error {
  constructor() {
    super("CONTENT_FEEDBACK_STORAGE_UNAVAILABLE");
    this.name = "ContentFeedbackStorageUnavailableError";
  }
}

function isContentFeedbackStorageUnavailableError(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: unknown; message?: unknown };
  if (
    maybeError.code === "42P01" &&
    typeof maybeError.message === "string" &&
    maybeError.message.includes("content_feedback")
  ) {
    return true;
  }

  const cause = (error as { cause?: unknown }).cause;
  return depth < 3 && cause !== undefined ? isContentFeedbackStorageUnavailableError(cause, depth + 1) : false;
}

function isContentFeedbackType(value: string): value is ContentFeedbackType {
  return CONTENT_FEEDBACK_TYPES.includes(value as ContentFeedbackType);
}

function normalizeFeedbackType(value: unknown): ContentFeedbackType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return isContentFeedbackType(normalized) ? normalized : null;
}

function normalizeFeedbackBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (normalized.length < 4 || normalized.length > CONTENT_FEEDBACK_BODY_MAX_LENGTH) {
    return null;
  }
  return normalized;
}

function normalizeFeedbackSourceUrl(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > CONTENT_FEEDBACK_SOURCE_URL_MAX_LENGTH) return undefined;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

export function normalizeContentFeedbackInput(input: {
  address?: string;
  contentId?: unknown;
  feedbackType?: unknown;
  body?: unknown;
  sourceUrl?: unknown;
}): { ok: true; payload: NormalizedContentFeedbackInput } | { ok: false; error: string } {
  if (!input.address || !isValidWalletAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  const contentId = normalizeContentId(input.contentId);
  if (!contentId) {
    return { ok: false, error: "Missing or invalid contentId" };
  }

  const feedbackType = normalizeFeedbackType(input.feedbackType);
  if (!feedbackType) {
    return { ok: false, error: "Choose a feedback type" };
  }

  const body = normalizeFeedbackBody(input.body);
  if (!body) {
    return {
      ok: false,
      error: `Feedback must be between 4 and ${CONTENT_FEEDBACK_BODY_MAX_LENGTH} characters`,
    };
  }
  if (containsBlockedText(body).blocked) {
    return { ok: false, error: "Feedback contains blocked content" };
  }

  const sourceUrl = normalizeFeedbackSourceUrl(input.sourceUrl);
  if (sourceUrl === undefined) {
    return { ok: false, error: "Source URL must be a valid http(s) URL" };
  }
  if (sourceUrl && containsBlockedUrl(sourceUrl).blocked) {
    return { ok: false, error: "Source URL is blocked by this frontend" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(input.address),
      contentId,
      feedbackType,
      body,
      sourceUrl,
    },
  };
}

export function normalizeContentFeedbackReadInput(input: {
  address?: string | null;
  contentId?: unknown;
}): { ok: true; payload: NormalizedContentFeedbackReadInput } | { ok: false; error: string } {
  const contentId = normalizeContentId(input.contentId);
  if (!contentId) {
    return { ok: false, error: "Missing or invalid contentId" };
  }

  if (input.address === undefined || input.address === null || input.address === "") {
    return { ok: true, payload: { contentId, normalizedAddress: null } };
  }

  if (!isValidWalletAddress(input.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  return {
    ok: true,
    payload: {
      contentId,
      normalizedAddress: normalizeWalletAddress(input.address),
    },
  };
}

export function normalizeContentFeedbackCountsInput(value: unknown): string[] {
  if (typeof value !== "string") return [];

  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const contentId = normalizeContentId(part);
    if (contentId) {
      seen.add(contentId);
    }
    if (seen.size >= 100) break;
  }

  return Array.from(seen);
}

function createContentFeedbackTimestamp(nowMs = Date.now()): Date {
  return new Date(Math.floor(nowMs / 1000) * 1000);
}

function isTerminalRoundState(state: unknown): state is Exclude<RoundState, typeof ROUND_STATE.Open> {
  return (
    state === ROUND_STATE.Settled ||
    state === ROUND_STATE.Cancelled ||
    state === ROUND_STATE.Tied ||
    state === ROUND_STATE.RevealFailed
  );
}

export function buildContentFeedbackRoundContext(
  rounds: Array<{ roundId?: string | number | bigint | null; state?: unknown }>,
  openRoundId?: string | number | bigint | null,
): ContentFeedbackRoundContext {
  const normalizedOpenRoundId = openRoundId !== undefined && openRoundId !== null ? String(openRoundId) : null;
  let latestRoundId: string | null = null;
  const terminalRoundIds = new Set<string>();

  for (const round of rounds) {
    if (round.roundId === undefined || round.roundId === null) continue;
    const roundId = String(round.roundId);
    if (latestRoundId === null || BigInt(roundId) > BigInt(latestRoundId)) {
      latestRoundId = roundId;
    }
    if (isTerminalRoundState(round.state)) {
      terminalRoundIds.add(roundId);
    }
  }

  const openRoundFromRows =
    normalizedOpenRoundId ??
    rounds.find(round => round.state === ROUND_STATE.Open && round.roundId !== undefined && round.roundId !== null)
      ?.roundId;
  const resolvedOpenRoundId =
    openRoundFromRows !== undefined && openRoundFromRows !== null ? String(openRoundFromRows) : null;

  return {
    openRoundId: resolvedOpenRoundId,
    currentRoundId: resolvedOpenRoundId ?? latestRoundId,
    terminalRoundIds,
    settlementComplete: resolvedOpenRoundId === null && terminalRoundIds.size > 0,
  };
}

export async function resolveContentFeedbackRoundContext(contentId: string): Promise<ContentFeedbackRoundContext> {
  const [contentResponse, rounds] = await Promise.all([
    ponderApi.getContentById(contentId),
    ponderApi.getAllRounds({ contentId }),
  ]);

  return buildContentFeedbackRoundContext(rounds, contentResponse.content.openRound?.roundId ?? null);
}

function isFeedbackPublic(row: Pick<FeedbackRow, "roundId">, context: ContentFeedbackRoundContext) {
  if (!row.roundId) {
    return context.settlementComplete;
  }
  return context.terminalRoundIds.has(row.roundId);
}

function mapFeedbackRow(
  row: FeedbackRow,
  params: {
    context: ContentFeedbackRoundContext;
    viewerAddress?: `0x${string}` | null;
  },
): ContentFeedbackItem | null {
  if (row.deletedAt || row.moderationStatus !== APPROVED_MODERATION_STATUS) {
    return null;
  }

  const authorAddress = normalizeWalletAddress(row.authorAddress);
  const feedbackType = normalizeFeedbackType(row.feedbackType);
  if (!feedbackType) {
    return null;
  }

  const isOwn = params.viewerAddress === authorAddress;
  const isPublic = isFeedbackPublic(row, params.context);
  if (!isPublic && !isOwn) {
    return null;
  }

  return {
    id: row.id,
    contentId: row.contentId,
    roundId: row.roundId,
    authorAddress,
    feedbackType,
    feedbackTypeLabel: CONTENT_FEEDBACK_TYPE_LABELS[feedbackType],
    body: row.body,
    sourceUrl: row.sourceUrl,
    moderationStatus: row.moderationStatus,
    visibilityStatus: row.visibilityStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isOwn,
    isPublic,
  };
}

export async function addContentFeedback(
  payload: NormalizedContentFeedbackInput,
  context: ContentFeedbackRoundContext,
): Promise<ContentFeedbackItem> {
  if (!context.currentRoundId) {
    throw new Error("CONTENT_ROUND_UNAVAILABLE");
  }

  const now = createContentFeedbackTimestamp();
  let row: FeedbackRow | undefined;
  try {
    [row] = await db
      .insert(contentFeedback)
      .values({
        contentId: payload.contentId,
        roundId: context.currentRoundId,
        authorAddress: payload.normalizedAddress,
        feedbackType: payload.feedbackType,
        body: payload.body,
        sourceUrl: payload.sourceUrl,
        moderationStatus: APPROVED_MODERATION_STATUS,
        visibilityStatus: HIDDEN_UNTIL_SETTLEMENT_STATUS,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returning();
  } catch (error) {
    if (isContentFeedbackStorageUnavailableError(error)) {
      throw new ContentFeedbackStorageUnavailableError();
    }
    throw error;
  }

  const item = row ? mapFeedbackRow(row, { context, viewerAddress: payload.normalizedAddress }) : null;
  if (!item) {
    throw new Error("CONTENT_FEEDBACK_INSERT_FAILED");
  }

  return item;
}

export async function listContentFeedback(params: {
  contentId: string;
  context: ContentFeedbackRoundContext;
  viewerAddress?: `0x${string}` | null;
}): Promise<ContentFeedbackListResult> {
  let rows: FeedbackRow[];
  try {
    rows = await db
      .select()
      .from(contentFeedback)
      .where(and(eq(contentFeedback.contentId, params.contentId), isNull(contentFeedback.deletedAt)))
      .orderBy(desc(contentFeedback.createdAt), desc(contentFeedback.id))
      .limit(CONTENT_FEEDBACK_LIST_LIMIT);
  } catch (error) {
    if (!isContentFeedbackStorageUnavailableError(error)) {
      throw error;
    }

    return {
      items: [],
      count: 0,
      publicCount: 0,
      ownHiddenCount: 0,
      settlementComplete: params.context.settlementComplete,
      openRoundId: params.context.openRoundId,
    };
  }

  const publicCount = rows.filter(
    row => row.moderationStatus === APPROVED_MODERATION_STATUS && isFeedbackPublic(row, params.context),
  ).length;
  const items = rows
    .map(row => mapFeedbackRow(row, { context: params.context, viewerAddress: params.viewerAddress }))
    .filter((item): item is ContentFeedbackItem => item !== null);
  const ownHiddenCount = items.filter(item => item.isOwn && !item.isPublic).length;

  return {
    items,
    count: items.length,
    publicCount,
    ownHiddenCount,
    settlementComplete: params.context.settlementComplete,
    openRoundId: params.context.openRoundId,
  };
}

export async function listContentFeedbackCounts(params: {
  contentIds: string[];
  contextByContentId: Map<string, ContentFeedbackRoundContext>;
}): Promise<Record<string, number>> {
  const counts = Object.fromEntries(params.contentIds.map(contentId => [contentId, 0]));
  if (params.contentIds.length === 0) {
    return counts;
  }

  let rows: Array<{
    contentId: string;
    roundId: string | null;
    moderationStatus: string;
  }>;
  try {
    rows = await db
      .select({
        contentId: contentFeedback.contentId,
        roundId: contentFeedback.roundId,
        moderationStatus: contentFeedback.moderationStatus,
      })
      .from(contentFeedback)
      .where(and(inArray(contentFeedback.contentId, params.contentIds), isNull(contentFeedback.deletedAt)));
  } catch (error) {
    if (isContentFeedbackStorageUnavailableError(error)) {
      return counts;
    }
    throw error;
  }

  for (const row of rows) {
    if (row.moderationStatus !== APPROVED_MODERATION_STATUS) continue;
    const context = params.contextByContentId.get(row.contentId);
    if (!context || !isFeedbackPublic(row, context)) continue;
    counts[row.contentId] = (counts[row.contentId] ?? 0) + 1;
  }

  return counts;
}
