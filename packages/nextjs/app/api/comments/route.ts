import { NextRequest, NextResponse } from "next/server";
import { asc, count, eq, inArray } from "drizzle-orm";
import { verifyMessage } from "viem";
import { db } from "~~/lib/db";
import { comments, userProfiles } from "~~/lib/db/schema";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 }; // 60 req/min per IP
const WRITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 }; // 10 req/min per IP

// GET: Fetch comments for a content item
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, READ_RATE_LIMIT);
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
    const profiles =
      addresses.length > 0
        ? await db.select().from(userProfiles).where(inArray(userProfiles.walletAddress, addresses))
        : [];

    const profileMap: Record<string, { username: string | null; profileImageUrl: string | null }> = {};
    for (const p of profiles) {
      profileMap[p.walletAddress] = { username: p.username, profileImageUrl: p.profileImageUrl };
    }

    const enrichedComments = rows.map(row => ({
      id: row.id,
      contentId: row.contentId,
      walletAddress: row.walletAddress,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      username: profileMap[row.walletAddress]?.username || null,
      profileImageUrl: profileMap[row.walletAddress]?.profileImageUrl || null,
    }));

    return NextResponse.json({ comments: enrichedComments, count: enrichedComments.length, totalCount, limit, offset });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return NextResponse.json({ error: "Failed to fetch comments" }, { status: 500 });
  }
}

// POST: Create a comment with wallet signature verification
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { contentId, body, address, signature } = await request.json();

    if (!contentId || !body || !address || !signature) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const trimmedBody = body.trim();
    if (trimmedBody.length === 0 || trimmedBody.length > 500) {
      return NextResponse.json({ error: "Comment must be 1-500 characters" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
    }

    // Verify wallet signature (message includes contentId + body to prevent replay)
    const message = `Post comment on Curyo content #${contentId}:\n${trimmedBody}`;
    const isValid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const normalizedAddress = address.toLowerCase();
    const now = new Date();

    const [inserted] = await db
      .insert(comments)
      .values({
        contentId: contentId.toString(),
        walletAddress: normalizedAddress,
        body: trimmedBody,
        createdAt: now,
      })
      .returning();

    // Fetch profile for response enrichment
    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.walletAddress, normalizedAddress))
      .limit(1);

    return NextResponse.json({
      comment: {
        id: inserted.id,
        contentId: inserted.contentId,
        walletAddress: inserted.walletAddress,
        body: inserted.body,
        createdAt: inserted.createdAt.toISOString(),
        username: profile[0]?.username || null,
        profileImageUrl: profile[0]?.profileImageUrl || null,
      },
    });
  } catch (error) {
    console.error("Error creating comment:", error);
    return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
  }
}
