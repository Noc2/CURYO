import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_PROFILE_ACTION,
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
  createSignedCollectionReadItemsResponse,
  createSignedCollectionResponse,
  ensureSignedCollectionReadSession,
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

    const readFailure = await ensureSignedCollectionReadSession(request, {
      cookieName: PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME,
      walletAddress: normalized.payload.normalizedAddress,
      scope: "profile_follows",
    });
    if (readFailure) {
      return readFailure;
    }

    const items = await listFollowedProfiles(normalized.payload.normalizedAddress);
    return createSignedCollectionResponse(items);
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
    return createSignedCollectionReadItemsResponse(payload.normalizedAddress, "profile_follows", items);
  } catch (error) {
    console.error("Error fetching followed profiles:", error);
    return NextResponse.json({ error: "Failed to fetch follows" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { address, targetAddress, signature, challengeId } = await request.json();
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof address === "string" ? address : undefined],
    });
    if (limited) return limited;

    const normalized = normalizeProfileFollowChallengeInput({ address, targetAddress });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashProfileFollowPayload(payload);
    const writeAccess = await verifySignedCollectionWriteAccess(request, {
      cookieName: PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME,
      walletAddress: payload.normalizedAddress,
      scope: "profile_follows",
      signature,
      challengeId: typeof challengeId === "string" ? challengeId : undefined,
      action: FOLLOW_PROFILE_ACTION,
      payloadHash,
      buildMessage: ({ nonce, expiresAt }) =>
        buildProfileFollowChallengeMessage({
          action: FOLLOW_PROFILE_ACTION,
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    await addFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, following: true, targetAddress: payload.normalizedTargetAddress }),
      {
        hasWriteSession: writeAccess.hasWriteSession,
        walletAddress: payload.normalizedAddress,
        scope: "profile_follows",
      },
    );
  } catch (error) {
    console.error("Error following profile:", error);
    return NextResponse.json({ error: "Failed to follow profile" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { address, targetAddress, signature, challengeId } = await request.json();
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof address === "string" ? address : undefined],
    });
    if (limited) return limited;

    const normalized = normalizeProfileFollowChallengeInput({ address, targetAddress });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashProfileFollowPayload(payload);
    const writeAccess = await verifySignedCollectionWriteAccess(request, {
      cookieName: PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME,
      walletAddress: payload.normalizedAddress,
      scope: "profile_follows",
      signature,
      challengeId: typeof challengeId === "string" ? challengeId : undefined,
      action: UNFOLLOW_PROFILE_ACTION,
      payloadHash,
      buildMessage: ({ nonce, expiresAt }) =>
        buildProfileFollowChallengeMessage({
          action: UNFOLLOW_PROFILE_ACTION,
          address: payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (!writeAccess.ok) {
      return writeAccess.response;
    }

    await removeFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress);
    return maybeIssueSignedCollectionWriteSession(
      NextResponse.json({ ok: true, following: false, targetAddress: payload.normalizedTargetAddress }),
      {
        hasWriteSession: writeAccess.hasWriteSession,
        walletAddress: payload.normalizedAddress,
        scope: "profile_follows",
      },
    );
  } catch (error) {
    console.error("Error unfollowing profile:", error);
    return NextResponse.json({ error: "Failed to unfollow profile" }, { status: 500 });
  }
}
