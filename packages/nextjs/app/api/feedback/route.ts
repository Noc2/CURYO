import { NextRequest, NextResponse } from "next/server";
import {
  CREATE_CONTENT_FEEDBACK_ACTION,
  buildContentFeedbackChallengeMessage,
  hashContentFeedbackPayload,
} from "~~/lib/auth/contentFeedbackChallenge";
import {
  CONTENT_FEEDBACK_SIGNED_READ_SESSION_COOKIE_NAME,
  getSignedReadSessionCookie,
  issueSignedReadSession,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import {
  ContentFeedbackStorageUnavailableError,
  addContentFeedback,
  listContentFeedback,
  normalizeContentFeedbackInput,
  normalizeContentFeedbackReadInput,
  resolveContentFeedbackRoundContext,
} from "~~/lib/feedback/contentFeedback";
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
    const payloadHash = hashContentFeedbackPayload(payload);
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
    if (!context.currentRoundId) {
      return NextResponse.json({ error: "Feedback opens after the first round starts" }, { status: 409 });
    }

    const item = await addContentFeedback(payload, context);
    const session = await issueSignedReadSession(payload.normalizedAddress, "content_feedback");
    const response = NextResponse.json({ ok: true, item });
    response.cookies.set(getSignedReadSessionCookie("content_feedback", session));

    return response;
  } catch (error) {
    if (error instanceof ContentFeedbackStorageUnavailableError) {
      return NextResponse.json({ error: "Feedback storage is not ready yet" }, { status: 503 });
    }

    console.error("Error creating feedback:", error);
    return NextResponse.json({ error: "Failed to create feedback" }, { status: 500 });
  }
}
