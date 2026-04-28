import { NextRequest, NextResponse } from "next/server";
import {
  CREATE_CONTENT_FEEDBACK_ACTION,
  buildContentFeedbackChallengeMessage,
  hashContentFeedbackPayload,
} from "~~/lib/auth/contentFeedbackChallenge";
import {
  CONTENT_FEEDBACK_SIGNED_READ_SESSION_COOKIE_NAME,
  setAllSignedReadSessionCookies,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import {
  ContentFeedbackDuplicateError,
  ContentFeedbackStorageUnavailableError,
  ContentFeedbackVoterEligibilityError,
  type PreparedContentFeedbackInput,
  addContentFeedback,
  assertContentFeedbackVoterEligibility,
  buildPreparedContentFeedbackInput,
  listContentFeedback,
  normalizeContentFeedbackInput,
  normalizeContentFeedbackReadInput,
  resolveContentFeedbackRoundContext,
} from "~~/lib/feedback/contentFeedback";
import { normalizeContentFeedbackHashMetadata } from "~~/lib/feedback/feedbackHash";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const contentIdParam = request.nextUrl.searchParams.get("contentId");
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined, contentIdParam ?? undefined],
  });
  if (limited) return limited;

  try {
    const normalized = normalizeContentFeedbackReadInput({
      address,
      contentId: contentIdParam,
    });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const requestedViewerAddress = normalized.payload.normalizedAddress;
    const hasReadSession = requestedViewerAddress
      ? await verifySignedReadSession(
          request.cookies.get(CONTENT_FEEDBACK_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
          requestedViewerAddress,
          "content_feedback",
        )
      : false;
    const viewerAddress = hasReadSession ? requestedViewerAddress : null;
    const context = await resolveContentFeedbackRoundContext(normalized.payload.contentId);
    const result = await listContentFeedback({
      contentId: normalized.payload.contentId,
      context,
      viewerAddress,
    });

    return NextResponse.json({
      ...result,
      hasReadSession,
    });
  } catch (error) {
    console.error("Error fetching feedback:", error);
    return NextResponse.json({ error: "Failed to fetch feedback" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      contentId?: unknown;
      feedbackType?: unknown;
      body?: unknown;
      sourceUrl?: unknown;
      chainId?: unknown;
      roundId?: unknown;
      clientNonce?: unknown;
      feedbackHash?: unknown;
      signature?: `0x${string}`;
      challengeId?: string;
    };
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined],
    });
    if (limited) return limited;

    if (!body.signature || !body.challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeContentFeedbackInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const metadata = normalizeContentFeedbackHashMetadata({
      chainId: body.chainId,
      roundId: body.roundId,
      clientNonce: body.clientNonce,
      feedbackHash: body.feedbackHash,
    });
    if (!metadata.ok) {
      return NextResponse.json({ error: metadata.error }, { status: 400 });
    }

    let preparedPayload: PreparedContentFeedbackInput;
    try {
      preparedPayload = buildPreparedContentFeedbackInput(payload, {
        ...metadata.metadata,
        payloadSignature: body.signature,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "CONTENT_FEEDBACK_HASH_MISMATCH") {
        return NextResponse.json({ error: "Feedback hash does not match the signed payload" }, { status: 400 });
      }
      throw error;
    }
    const payloadHash = hashContentFeedbackPayload(preparedPayload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: CREATE_CONTENT_FEEDBACK_ACTION,
      walletAddress: payload.normalizedAddress,
      payloadHash,
      signature: body.signature,
      buildMessage: ({ nonce, expiresAt }) =>
        buildContentFeedbackChallengeMessage({
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    const context = await resolveContentFeedbackRoundContext(payload.contentId);
    if (
      !context.currentRoundId ||
      context.currentRoundId !== preparedPayload.roundId ||
      context.openRoundId !== preparedPayload.roundId
    ) {
      return NextResponse.json({ error: "Feedback is only open while voting is active" }, { status: 409 });
    }

    try {
      await assertContentFeedbackVoterEligibility({
        contentId: payload.contentId,
        roundId: preparedPayload.roundId,
        address: payload.normalizedAddress,
      });
    } catch (error) {
      if (error instanceof ContentFeedbackVoterEligibilityError) {
        return NextResponse.json({ error: "Vote on this question before saving feedback" }, { status: 403 });
      }
      throw error;
    }

    const item = await addContentFeedback(preparedPayload, context);
    const response = NextResponse.json({ ok: true, item });

    return setAllSignedReadSessionCookies(response, payload.normalizedAddress);
  } catch (error) {
    if (error instanceof ContentFeedbackStorageUnavailableError) {
      return NextResponse.json({ error: "Feedback storage is not ready yet" }, { status: 503 });
    }
    if (error instanceof ContentFeedbackDuplicateError) {
      return NextResponse.json({ error: "You already saved feedback for this round" }, { status: 409 });
    }

    console.error("Error creating feedback:", error);
    return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
  }
}
