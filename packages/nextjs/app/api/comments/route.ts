import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq } from "drizzle-orm";
import {
  COMMENT_CHALLENGE_ACTION,
  buildCommentChallengeMessage,
  hashCommentChallengePayload,
  normalizeCommentChallengeInput,
} from "~~/lib/auth/commentChallenge";
import { ensureSignedActionChallengeTable, verifyAndConsumeSignedActionChallenge } from "~~/lib/auth/signedActions";
import { db } from "~~/lib/db";
import { comments } from "~~/lib/db/schema";
import { readProfileRegistryProfile, readProfileRegistryProfiles } from "~~/lib/profileRegistry/server";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 }; // 60 req/min per IP
const WRITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 }; // 10 req/min per IP

// GET: Fetch comments for a content item
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const contentId = request.nextUrl.searchParams.get("contentId");
    if (!contentId) {
      return NextResponse.json({ error: "Missing contentId" }, { status: 400 });
    }

    const MAX_LIMIT = 50;
    const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get("limit") ?? "50") || 50, 1), MAX_LIMIT);
    const offset = Math.max(parseInt(request.nextUrl.searchParams.get("offset") ?? "0") || 0, 0);

    const rows = await db
      .select()
      .from(comments)
      .where(eq(comments.contentId, contentId))
      .orderBy(asc(comments.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalRow] = await db.select({ total: count() }).from(comments).where(eq(comments.contentId, contentId));
    const totalCount = totalRow?.total ?? 0;

    // Batch-fetch user profiles for all commenters
    const addresses = [...new Set(rows.map(r => r.walletAddress))];
    const profileMap = await readProfileRegistryProfiles(addresses);

    const enrichedComments = rows.map(row => ({
      id: row.id,
      contentId: row.contentId,
      walletAddress: row.walletAddress,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      username: profileMap[row.walletAddress.toLowerCase()]?.username || null,
      profileImageUrl: profileMap[row.walletAddress.toLowerCase()]?.profileImageUrl || null,
    }));

    return NextResponse.json({ comments: enrichedComments, count: enrichedComments.length, totalCount, limit, offset });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

// POST: Create a comment with wallet signature verification
export async function POST(request: NextRequest) {
  try {
    const { contentId, body, address, signature, challengeId } = await request.json();
    const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
      extraKeyParts: [typeof address === "string" ? address : undefined],
    });
    if (limited) return limited;

    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalized = normalizeCommentChallengeInput({ contentId, body, address });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashCommentChallengePayload(payload);
    const now = new Date();
    let inserted: typeof comments.$inferSelect | undefined;

    await ensureSignedActionChallengeTable();

    try {
      await db.transaction(async tx => {
        await verifyAndConsumeSignedActionChallenge(tx, {
          challengeId: String(challengeId),
          action: COMMENT_CHALLENGE_ACTION,
          walletAddress: payload.normalizedAddress,
          payloadHash,
          signature: signature as `0x${string}`,
          now,
          buildMessage: ({ nonce, expiresAt }) =>
            buildCommentChallengeMessage({
              address: payload.normalizedAddress,
              payloadHash,
              nonce,
              expiresAt,
            }),
        });

        [inserted] = await tx
          .insert(comments)
          .values({
            contentId: payload.contentId,
            walletAddress: payload.normalizedAddress,
            body: payload.body,
            createdAt: now,
          })
          .returning();
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

    // Fetch profile for response enrichment
    const profile = await readProfileRegistryProfile(payload.normalizedAddress);

    if (!inserted) {
      throw new Error("COMMENT_INSERT_FAILED");
    }

    return NextResponse.json({
      comment: {
        id: inserted.id,
        contentId: inserted.contentId,
        walletAddress: inserted.walletAddress,
        body: inserted.body,
        createdAt: inserted.createdAt.toISOString(),
        username: profile.username,
        profileImageUrl: profile.profileImageUrl,
      },
    });
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
