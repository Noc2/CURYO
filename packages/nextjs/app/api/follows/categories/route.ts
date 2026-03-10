import { NextRequest, NextResponse } from "next/server";
import {
  FOLLOW_CATEGORY_ACTION,
  UNFOLLOW_CATEGORY_ACTION,
  buildCategoryFollowChallengeMessage,
  hashCategoryFollowPayload,
  normalizeCategoryFollowInput,
} from "~~/lib/auth/categoryFollow";
import { ensureSignedActionChallengeTable, verifyAndConsumeSignedActionChallenge } from "~~/lib/auth/signedActions";
import { addFollowedCategory, listFollowedCategories, removeFollowedCategory } from "~~/lib/categories/follows";
import { db } from "~~/lib/db";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";
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

    const items = await listFollowedCategories(normalizeWalletAddress(address));
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching followed categories:", error);
    return NextResponse.json({ error: "Failed to fetch followed categories" }, { status: 500 });
  }
}

async function verifyFollowAction(
  request: NextRequest,
  action: string,
): Promise<
  | { ok: true; payload: { normalizedAddress: `0x${string}`; categoryId: string } }
  | { ok: false; response: NextResponse }
> {
  const body = (await request.json()) as Record<string, unknown> & {
    signature?: `0x${string}`;
    challengeId?: string;
  };

  if (!body.signature || !body.challengeId) {
    return { ok: false, response: NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 }) };
  }

  const normalized = normalizeCategoryFollowInput(body);
  if (!normalized.ok) {
    return { ok: false, response: NextResponse.json({ error: normalized.error }, { status: 400 }) };
  }

  const payload = normalized.payload;
  const payloadHash = hashCategoryFollowPayload(payload);
  await ensureSignedActionChallengeTable();

  try {
    await db.transaction(async tx => {
      await verifyAndConsumeSignedActionChallenge(tx, {
        challengeId: String(body.challengeId),
        action,
        walletAddress: payload.normalizedAddress,
        payloadHash,
        signature: body.signature as `0x${string}`,
        buildMessage: ({ nonce, expiresAt }) =>
          buildCategoryFollowChallengeMessage({
            action,
            address: payload.normalizedAddress,
            payloadHash,
            nonce,
            expiresAt,
          }),
      });
    });
  } catch (error: any) {
    if (error.message === "CHALLENGE_USED") {
      return { ok: false, response: NextResponse.json({ error: "Challenge already used" }, { status: 409 }) };
    }
    if (error.message === "CHALLENGE_EXPIRED") {
      return { ok: false, response: NextResponse.json({ error: "Challenge expired" }, { status: 401 }) };
    }
    if (error.message === "INVALID_CHALLENGE" || error.message === "INVALID_SIGNATURE") {
      return { ok: false, response: NextResponse.json({ error: "Invalid signature challenge" }, { status: 401 }) };
    }
    throw error;
  }

  return { ok: true, payload };
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const verified = await verifyFollowAction(request, FOLLOW_CATEGORY_ACTION);
    if (!verified.ok) return verified.response;

    await addFollowedCategory(verified.payload.normalizedAddress, verified.payload.categoryId);
    return NextResponse.json({ ok: true, following: true, categoryId: verified.payload.categoryId });
  } catch (error) {
    console.error("Error following category:", error);
    return NextResponse.json({ error: "Failed to follow category" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const verified = await verifyFollowAction(request, UNFOLLOW_CATEGORY_ACTION);
    if (!verified.ok) return verified.response;

    await removeFollowedCategory(verified.payload.normalizedAddress, verified.payload.categoryId);
    return NextResponse.json({ ok: true, following: false, categoryId: verified.payload.categoryId });
  } catch (error) {
    console.error("Error unfollowing category:", error);
    return NextResponse.json({ error: "Failed to unfollow category" }, { status: 500 });
  }
}
