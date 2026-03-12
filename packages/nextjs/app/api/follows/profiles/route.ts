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
  ensureSignedActionChallengeTable,
  mapSignedActionError,
  verifyAndConsumeSignedActionChallenge,
} from "~~/lib/auth/signedActions";
import {
  PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME,
  getSignedReadSessionCookie,
  issueSignedReadSession,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import {
  PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME,
  getSignedWriteSessionCookie,
  issueSignedWriteSession,
  verifySignedWriteSession,
} from "~~/lib/auth/signedWriteSessions";
import { db } from "~~/lib/db";
import { addFollowedProfile, listFollowedProfiles, removeFollowedProfile } from "~~/lib/follows/profileFollow";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

async function hasProfileFollowWriteSession(request: NextRequest, walletAddress: `0x${string}`) {
  return verifySignedWriteSession(
    request.cookies.get(PROFILE_FOLLOWS_SIGNED_WRITE_SESSION_COOKIE_NAME)?.value,
    walletAddress,
    "profile_follows",
  );
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

    const hasSession = await verifySignedReadSession(
      request.cookies.get(PROFILE_FOLLOWS_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
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
    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
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
      });
    } catch (error: unknown) {
      const mapped = mapSignedActionError(error);
      if (mapped) {
        return NextResponse.json({ error: mapped.error }, { status: mapped.status });
      }
      throw error;
    }

    const session = await issueSignedReadSession(payload.normalizedAddress, "profile_follows");
    const items = await listFollowedProfiles(payload.normalizedAddress);
    const response = NextResponse.json({ items, count: items.length });
    response.cookies.set(getSignedReadSessionCookie("profile_follows", session));
    return response;
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
    const hasWriteSession = await hasProfileFollowWriteSession(request, payload.normalizedAddress);

    if (!hasWriteSession) {
      if (!signature || !challengeId) {
        return NextResponse.json({ error: "Signed write required" }, { status: 401 });
      }

      const payloadHash = hashProfileFollowPayload(payload);
      await ensureSignedActionChallengeTable();

      try {
        await db.transaction(async tx => {
          await verifyAndConsumeSignedActionChallenge(tx, {
            challengeId: String(challengeId),
            action: FOLLOW_PROFILE_ACTION,
            walletAddress: payload.normalizedAddress,
            payloadHash,
            signature: signature as `0x${string}`,
            buildMessage: ({ nonce, expiresAt }) =>
              buildProfileFollowChallengeMessage({
                action: FOLLOW_PROFILE_ACTION,
                address: payload.normalizedAddress,
                payloadHash,
                nonce,
                expiresAt,
              }),
          });
        });
      } catch (error: unknown) {
        const mapped = mapSignedActionError(error);
        if (mapped) {
          return NextResponse.json({ error: mapped.error }, { status: mapped.status });
        }
        throw error;
      }
    }

    await addFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress);
    const response = NextResponse.json({ ok: true, following: true, targetAddress: payload.normalizedTargetAddress });
    if (!hasWriteSession) {
      const session = await issueSignedWriteSession(payload.normalizedAddress, "profile_follows");
      response.cookies.set(getSignedWriteSessionCookie("profile_follows", session));
    }
    return response;
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
    const hasWriteSession = await hasProfileFollowWriteSession(request, payload.normalizedAddress);

    if (!hasWriteSession) {
      if (!signature || !challengeId) {
        return NextResponse.json({ error: "Signed write required" }, { status: 401 });
      }

      const payloadHash = hashProfileFollowPayload(payload);
      await ensureSignedActionChallengeTable();

      try {
        await db.transaction(async tx => {
          await verifyAndConsumeSignedActionChallenge(tx, {
            challengeId: String(challengeId),
            action: UNFOLLOW_PROFILE_ACTION,
            walletAddress: payload.normalizedAddress,
            payloadHash,
            signature: signature as `0x${string}`,
            buildMessage: ({ nonce, expiresAt }) =>
              buildProfileFollowChallengeMessage({
                action: UNFOLLOW_PROFILE_ACTION,
                address: payload.normalizedAddress,
                payloadHash,
                nonce,
                expiresAt,
              }),
          });
        });
      } catch (error: unknown) {
        const mapped = mapSignedActionError(error);
        if (mapped) {
          return NextResponse.json({ error: mapped.error }, { status: mapped.status });
        }
        throw error;
      }
    }

    await removeFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress);
    const response = NextResponse.json({ ok: true, following: false, targetAddress: payload.normalizedTargetAddress });
    if (!hasWriteSession) {
      const session = await issueSignedWriteSession(payload.normalizedAddress, "profile_follows");
      response.cookies.set(getSignedWriteSessionCookie("profile_follows", session));
    }
    return response;
  } catch (error) {
    console.error("Error unfollowing profile:", error);
    return NextResponse.json({ error: "Failed to unfollow profile" }, { status: 500 });
  }
}
