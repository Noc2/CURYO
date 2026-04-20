import { NextRequest, NextResponse } from "next/server";
import {
  READ_CONTENT_FEEDBACK_ACTION,
  buildContentFeedbackReadChallengeMessage,
  hashContentFeedbackReadPayload,
} from "~~/lib/auth/contentFeedbackChallenge";
import { createSignedReadResponse, verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import {
  listContentFeedback,
  normalizeContentFeedbackReadInput,
  resolveContentFeedbackRoundContext,
} from "~~/lib/feedback/contentFeedback";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      contentId?: unknown;
      signature?: `0x${string}`;
      challengeId?: string;
    };
    const limited = await checkRateLimit(request, RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined],
    });
    if (limited) return limited;

    if (!body.signature || !body.challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeContentFeedbackReadInput({
      address: body.address,
      contentId: body.contentId,
    });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    if (!normalized.payload.normalizedAddress) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const readerAddress = normalized.payload.normalizedAddress as `0x${string}`;
    const payload = {
      ...normalized.payload,
      normalizedAddress: readerAddress,
    };
    const payloadHash = hashContentFeedbackReadPayload(payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: READ_CONTENT_FEEDBACK_ACTION,
      walletAddress: readerAddress,
      payloadHash,
      signature: body.signature,
      buildMessage: ({ nonce, expiresAt }) =>
        buildContentFeedbackReadChallengeMessage({
          address: readerAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    const context = await resolveContentFeedbackRoundContext(payload.contentId);
    const result = await listContentFeedback({
      contentId: payload.contentId,
      context,
      viewerAddress: readerAddress,
    });

    return createSignedReadResponse(readerAddress, "content_feedback", result);
  } catch (error) {
    console.error("Error reading feedback:", error);
    return NextResponse.json({ error: "Failed to read feedback" }, { status: 500 });
  }
}
