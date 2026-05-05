import { NextRequest, NextResponse } from "next/server";
import {
  READ_PRIVATE_ACCOUNT_ACTION,
  buildPrivateAccountReadChallengeMessage,
  hashPrivateAccountReadPayload,
  normalizePrivateAccountReadInput,
} from "~~/lib/auth/privateAccountAccess";
import {
  SIGNED_READ_SESSION_COOKIE_NAMES,
  SIGNED_READ_SESSION_SCOPES,
  setAllSignedReadSessionCookies,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import {
  SIGNED_WRITE_SESSION_COOKIE_NAMES,
  SIGNED_WRITE_SESSION_SCOPES,
  setAllSignedWriteSessionCookies,
  verifySignedWriteSession,
} from "~~/lib/auth/signedWriteSessions";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

async function hasAllPrivateReadSessions(request: NextRequest, walletAddress: `0x${string}`) {
  const readSessions = await Promise.all(
    SIGNED_READ_SESSION_SCOPES.map(scope =>
      verifySignedReadSession(
        request.cookies.get(SIGNED_READ_SESSION_COOKIE_NAMES[scope])?.value,
        walletAddress,
        scope,
      ),
    ),
  );
  const writeSessions = await Promise.all(
    SIGNED_WRITE_SESSION_SCOPES.map(scope =>
      verifySignedWriteSession(
        request.cookies.get(SIGNED_WRITE_SESSION_COOKIE_NAMES[scope])?.value,
        walletAddress,
        scope,
      ),
    ),
  );

  return readSessions.every(Boolean) && writeSessions.every(Boolean);
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    allowOnStoreUnavailable: true,
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  const normalized = normalizePrivateAccountReadInput({ address: typeof address === "string" ? address : undefined });
  if (!normalized.ok) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  try {
    const hasSession = await hasAllPrivateReadSessions(request, normalized.payload.normalizedAddress);
    return NextResponse.json({ hasSession });
  } catch (error) {
    console.error("Error checking private account session:", error);
    return NextResponse.json({ error: "Failed to check private account session" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown> & {
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

  try {
    const normalized = normalizePrivateAccountReadInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payloadHash = hashPrivateAccountReadPayload(normalized.payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: READ_PRIVATE_ACCOUNT_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash,
      signature: body.signature,
      buildMessage: ({ nonce, expiresAt }) =>
        buildPrivateAccountReadChallengeMessage({
          address: normalized.payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) return challengeFailure;

    const response = NextResponse.json({ ok: true, hasSession: true });
    await setAllSignedReadSessionCookies(response, normalized.payload.normalizedAddress);
    return setAllSignedWriteSessionCookies(response, normalized.payload.normalizedAddress);
  } catch (error) {
    console.error("Error creating private account session:", error);
    return NextResponse.json({ error: "Failed to create private account session" }, { status: 500 });
  }
}
