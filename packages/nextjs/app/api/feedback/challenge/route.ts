import { NextRequest, NextResponse } from "next/server";
import {
  CONTENT_FEEDBACK_CHALLENGE_TITLE,
  CREATE_CONTENT_FEEDBACK_ACTION,
  READ_CONTENT_FEEDBACK_ACTION,
  hashContentFeedbackPayload,
  hashContentFeedbackReadPayload,
} from "~~/lib/auth/contentFeedbackChallenge";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { normalizeContentFeedbackInput, normalizeContentFeedbackReadInput } from "~~/lib/feedback/contentFeedback";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      address?: string;
      contentId?: unknown;
      feedbackType?: unknown;
      body?: unknown;
      sourceUrl?: unknown;
      intent?: "read";
    };
    const limited = await checkRateLimit(request, RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined, body.intent ?? "create"],
    });
    if (limited) return limited;

    if (body.intent === "read") {
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

      const challenge = await issueSignedActionChallenge({
        title: CONTENT_FEEDBACK_CHALLENGE_TITLE,
        action: READ_CONTENT_FEEDBACK_ACTION,
        walletAddress: normalized.payload.normalizedAddress,
        payloadHash: hashContentFeedbackReadPayload(normalized.payload),
      });

      return NextResponse.json(challenge);
    }

    const normalized = normalizeContentFeedbackInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const challenge = await issueSignedActionChallenge({
      title: CONTENT_FEEDBACK_CHALLENGE_TITLE,
      action: CREATE_CONTENT_FEEDBACK_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashContentFeedbackPayload(normalized.payload),
    });

    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating feedback challenge:", error);
    return NextResponse.json({ error: "Failed to create feedback challenge" }, { status: 500 });
  }
}
