import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_PROFILE_ACTION,
  UNFOLLOW_PROFILE_ACTION,
  buildFollowProfileChallengeMessage,
  hashFollowProfileChallengePayload,
  normalizeFollowProfileChallengeInput,
} from "~~/lib/auth/followProfileChallenge";
import { ensureSignedActionChallengeTable, verifyAndConsumeSignedActionChallenge } from "~~/lib/auth/signedActions";
import { db } from "~~/lib/db";
import {
  addFollowedProfile,
  isValidWalletAddress,
  listFollowedProfiles,
  normalizeWalletAddress,
  removeFollowedProfile,
} from "~~/lib/social/profileFollows";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const address = request.nextUrl.searchParams.get("address");
    if (!address || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(address);
    const items = await listFollowedProfiles(normalizedAddress);
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching followed profiles:", error);
    return NextResponse.json({ error: "Failed to fetch followed profiles" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, targetAddress, signature, challengeId } = await request.json();
    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeFollowProfileChallengeInput({ address, targetAddress });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashFollowProfileChallengePayload(payload);
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
            buildFollowProfileChallengeMessage({
              action: FOLLOW_PROFILE_ACTION,
              address: payload.normalizedAddress,
              payloadHash,
              nonce,
              expiresAt,
            }),
        });
      });
    } catch (error: any) {
      if (error.message === "CHALLENGE_USED") {
        return NextResponse.json({ error: "Challenge already used" }, { status: 409 });
      }
      if (error.message === "CHALLENGE_EXPIRED") {
        return NextResponse.json({ error: "Challenge expired" }, { status: 401 });
      }
      if (error.message === "INVALID_CHALLENGE" || error.message === "INVALID_SIGNATURE") {
        return NextResponse.json({ error: "Invalid signature challenge" }, { status: 401 });
      }
      throw error;
    }

    await addFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress);
    return NextResponse.json({ ok: true, following: true, walletAddress: payload.normalizedTargetAddress });
  } catch (error) {
    console.error("Error following profile:", error);
    return NextResponse.json({ error: "Failed to follow profile" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, targetAddress, signature, challengeId } = await request.json();
    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeFollowProfileChallengeInput({ address, targetAddress });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashFollowProfileChallengePayload(payload);
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
            buildFollowProfileChallengeMessage({
              action: UNFOLLOW_PROFILE_ACTION,
              address: payload.normalizedAddress,
              payloadHash,
              nonce,
              expiresAt,
            }),
        });
      });
    } catch (error: any) {
      if (error.message === "CHALLENGE_USED") {
        return NextResponse.json({ error: "Challenge already used" }, { status: 409 });
      }
      if (error.message === "CHALLENGE_EXPIRED") {
        return NextResponse.json({ error: "Challenge expired" }, { status: 401 });
      }
      if (error.message === "INVALID_CHALLENGE" || error.message === "INVALID_SIGNATURE") {
        return NextResponse.json({ error: "Invalid signature challenge" }, { status: 401 });
      }
      throw error;
    }

    await removeFollowedProfile(payload.normalizedAddress, payload.normalizedTargetAddress);
    return NextResponse.json({ ok: true, following: false, walletAddress: payload.normalizedTargetAddress });
  } catch (error) {
    console.error("Error unfollowing profile:", error);
    return NextResponse.json({ error: "Failed to unfollow profile" }, { status: 500 });
  }
}
