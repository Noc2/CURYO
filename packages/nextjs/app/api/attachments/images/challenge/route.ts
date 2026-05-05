import { NextRequest, NextResponse } from "next/server";
import {
  IMAGE_UPLOAD_CHALLENGE_TITLE,
  UPLOAD_IMAGE_ACTION,
  hashImageUploadChallengePayload,
  normalizeImageUploadChallengeInput,
} from "~~/lib/auth/imageUploadChallenge";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const limited = await checkRateLimit(request, RATE_LIMIT, {
    extraKeyParts: [typeof body.address === "string" ? body.address : undefined],
  });
  if (limited) return limited;

  const normalized = normalizeImageUploadChallengeInput(body);
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const challenge = await issueSignedActionChallenge({
    title: IMAGE_UPLOAD_CHALLENGE_TITLE,
    action: UPLOAD_IMAGE_ACTION,
    walletAddress: normalized.payload.normalizedAddress,
    payloadHash: hashImageUploadChallengePayload(normalized.payload),
  });

  return NextResponse.json(challenge);
}
