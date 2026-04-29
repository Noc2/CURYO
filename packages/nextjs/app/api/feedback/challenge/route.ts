import { NextRequest, NextResponse } from "next/server";
import {
  CONTENT_FEEDBACK_CHALLENGE_TITLE,
  CREATE_CONTENT_FEEDBACK_ACTION,
  READ_CONTENT_FEEDBACK_ACTION,
  hashContentFeedbackPayload,
  hashContentFeedbackReadPayload,
} from "~~/lib/auth/contentFeedbackChallenge";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { getPrimaryServerTargetNetwork } from "~~/lib/env/server";
import {
  ContentFeedbackVoterEligibilityError,
  assertContentFeedbackVoterEligibility,
  buildContentFeedbackChallengePayload,
  normalizeContentFeedbackInput,
  normalizeContentFeedbackReadInput,
  resolveContentFeedbackRoundContext,
} from "~~/lib/feedback/contentFeedback";
import { createContentFeedbackNonce } from "~~/lib/feedback/feedbackHash";
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
    const targetNetwork = getPrimaryServerTargetNetwork();
    if (!targetNetwork) {
      return NextResponse.json({ error: "Feedback chain is not configured" }, { status: 503 });
    }

    const context = await resolveContentFeedbackRoundContext(normalized.payload.contentId);
    const roundId = context.openRoundId;
    if (!roundId || context.currentRoundId !== roundId) {
      return NextResponse.json({ error: "Feedback is only open while voting is active" }, { status: 409 });
    }

    try {
      await assertContentFeedbackVoterEligibility({
        contentId: normalized.payload.contentId,
        roundId,
        address: normalized.payload.normalizedAddress,
      });
    } catch (error) {
      if (error instanceof ContentFeedbackVoterEligibilityError) {
        return NextResponse.json({ error: "Vote on this question before saving feedback" }, { status: 403 });
      }
      throw error;
    }

    const challengePayload = buildContentFeedbackChallengePayload(normalized.payload, {
      chainId: targetNetwork.id,
      roundId,
      clientNonce: createContentFeedbackNonce(),
    });

    const challenge = await issueSignedActionChallenge({
      title: CONTENT_FEEDBACK_CHALLENGE_TITLE,
      action: CREATE_CONTENT_FEEDBACK_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashContentFeedbackPayload(challengePayload),
    });

    return NextResponse.json({
      ...challenge,
      chainId: challengePayload.chainId,
      roundId: challengePayload.roundId,
      clientNonce: challengePayload.clientNonce,
      feedbackHash: challengePayload.feedbackHash,
    });
  } catch (error) {
    console.error("Error creating feedback challenge:", error);
    return NextResponse.json({ error: "Failed to create feedback challenge" }, { status: 500 });
  }
}
