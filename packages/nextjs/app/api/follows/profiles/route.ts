import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_PROFILE_ACTION,
  type NormalizedProfileFollowPayload,
  READ_PROFILE_FOLLOWS_ACTION,
  UNFOLLOW_PROFILE_ACTION,
  buildProfileFollowChallengeMessage,
  buildProfileFollowReadChallengeMessage,
  hashProfileFollowPayload,
  hashProfileFollowReadPayload,
  normalizeProfileFollowChallengeInput,
  normalizeProfileFollowReadInput,
} from "~~/lib/auth/profileFollowChallenge";
import {
  createSignedCollectionReadResponse,
  hasSignedCollectionReadSession,
  maybeIssueSignedCollectionWriteSession,
  verifySignedCollectionChallenge,
  verifySignedCollectionWriteAccess,
} from "~~/lib/auth/signedCollectionRoute";
import { PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME } from "~~/lib/auth/signedReadSessions";
import { PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME } from "~~/lib/auth/signedWriteSessions";
import { addFollowedProfile, listFollowedProfiles, removeFollowedProfile } from "~~/lib/follows/profileFollow";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

type ProfileFollowWriteBody = {
  address?: string;
  targetAddress?: string;
  signature?: `0x${string}`;
  challengeId?: string;
};

async function handleProfileFollowWrite(
  request: NextRequest,
  params: {
    action: typeof FOLLOW_PROFILE_ACTION | typeof UNFOLLOW_PROFILE_ACTION;
    following: boolean;
    logMessage: string;
    responseError: string;
    mutate: (payload: NormalizedProfileFollowPayload) => Promise<void>;
  },
) {
  try {
    const body = (await request.json()) as ProfileFollowWriteBody;
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof body.address === "string" ? body.address : undefined],
    });
    if (limited) return limited;

    const normalized = normalizeProfileFollowChallengeInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashProfileFollowPayload(payload);
    const writeAccess = await verifySignedCollectionWriteAccess(request, {
      cookieName: PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME,
      walletAddress: payload.normalizedAddress,
      scope: "profile_follows",
      signature: body.signature,
      challengeId: body.challengeId,
      action: params.action,
      payloadHash,
      buildMessage: ({ nonce, expiresAt }) =>
        buildProfileFollowChallengeMessage({
          action: params.action,
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    await params.mutate(payload);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, following: params.following, targetAddress: payload.normalizedTargetAddress }),
      {
        hasWriteSession: writeAccess.hasWriteSession,
        walletAddress: payload.normalizedAddress,
        scope: "profile_follows",
      },
    );
  } catch (error) {
    console.error(params.logMessage, error);
    return NextResponse.json({ error: params.responseError }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  try {
    const normalized = normalizeProfileFollowReadInput({ address: typeof address === "string" ? address : undefined });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const hasSession = await hasSignedCollectionReadSession(
      request,
      PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME,
      normalized.payload.normalizedAddress,
      "profile_follows",
    );
    if (!hasSession) {
      return NextResponse.json({ error: "Signed read required" }, { status: 401 });
    }

    const items = await listFollowedProfiles(normalized.payload.normalizedAddress);
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching followed profiles:", error);
    return NextResponse.json({ error: "Failed to fetch follows" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, signature, challengeId } = (await request.json()) as Record<string, unknown> & {
      signature?: `0x${string}`;
      challengeId?: string;
    };

    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeProfileFollowReadInput({ address: typeof address === "string" ? address : undefined });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashProfileFollowReadPayload(payload);
    const challengeFailure = await verifySignedCollectionChallenge({
      challengeId: String(challengeId),
      action: READ_PROFILE_FOLLOWS_ACTION,
      walletAddress: payload.normalizedAddress,
      payloadHash,
      signature: signature as `0x${string}`,
      buildMessage: ({ nonce, expiresAt }) =>
        buildProfileFollowReadChallengeMessage({
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) {
      return challengeFailure;
    }

    const items = await listFollowedProfiles(payload.normalizedAddress);
    return createSignedCollectionReadResponse(payload.normalizedAddress, "profile_follows", {
      items,
      count: items.length,
    });
  } catch (error) {
    console.error("Error fetching followed profiles:", error);
    return NextResponse.json({ error: "Failed to fetch follows" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  return handleProfileFollowWrite(request, {
    action: FOLLOW_PROFILE_ACTION,
    following: true,
    logMessage: "Error following profile:",
    responseError: "Failed to follow profile",
    mutate: payload => addFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress),
  });
}

export async function DELETE(request: NextRequest) {
  return handleProfileFollowWrite(request, {
    action: UNFOLLOW_PROFILE_ACTION,
    following: false,
    logMessage: "Error unfollowing profile:",
    responseError: "Failed to unfollow profile",
    mutate: payload => removeFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress),
  });
}
