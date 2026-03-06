import { NextRequest, NextResponse } from "next/server";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { verifyMessage } from "viem";
import {
  PROFILE_UPDATE_CHALLENGE_ACTION,
  buildProfileUpdateChallengeMessage,
  ensureProfileUpdateChallengeTable,
  hashProfileUpdatePayload,
  normalizeProfileUpdateInput,
  signedActionChallenges,
} from "~~/lib/auth/profileUpdateChallenge";
import { db } from "~~/lib/db";
import { userProfiles } from "~~/lib/db/schema";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// GET: Fetch username(s) for address(es)
// Query params: ?address=0x... or ?addresses=0x...,0x...
export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const searchParams = request.nextUrl.searchParams;
    const singleAddress = searchParams.get("address");
    const multipleAddresses = searchParams.get("addresses");

    if (singleAddress) {
      // Fetch single profile
      const profile = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.walletAddress, singleAddress.toLowerCase()))
        .limit(1);

      return NextResponse.json({
        address: singleAddress.toLowerCase(),
        username: profile[0]?.username || null,
        profileImageUrl: profile[0]?.profileImageUrl || null,
      });
    }

    if (multipleAddresses) {
      // Fetch multiple profiles (cap at 100 to prevent oversized IN clauses)
      const addresses = multipleAddresses
        .split(",")
        .slice(0, 100)
        .map(a => a.toLowerCase());
      const profiles = await db.select().from(userProfiles).where(inArray(userProfiles.walletAddress, addresses));

      const profilesMap: Record<string, { username: string | null; profileImageUrl: string | null }> = {};
      addresses.forEach(addr => {
        const profile = profiles.find(p => p.walletAddress === addr);
        profilesMap[addr] = {
          username: profile?.username || null,
          profileImageUrl: profile?.profileImageUrl || null,
        };
      });

      return NextResponse.json({ profiles: profilesMap });
    }

    return NextResponse.json({ error: "Missing address parameter" }, { status: 400 });
  } catch (error) {
    console.error("Error fetching username:", error);
    return NextResponse.json({ error: "Failed to fetch username" }, { status: 500 });
  }
}

// POST: Set/update profile (username and/or profile image) with one-time wallet signature challenge
export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, username, profileImageUrl, signature, challengeId } = await request.json();

    if (!signature || !challengeId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const normalized = normalizeProfileUpdateInput({ address, username, profileImageUrl });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payload = normalized.payload;
    const payloadHash = hashProfileUpdatePayload(payload);
    const now = new Date();

    await ensureProfileUpdateChallengeTable();

    try {
      await db.transaction(async tx => {
        const [challenge] = await tx
          .select()
          .from(signedActionChallenges)
          .where(eq(signedActionChallenges.id, String(challengeId)))
          .limit(1);

        if (!challenge) {
          throw new Error("INVALID_CHALLENGE");
        }

        if (
          challenge.action !== PROFILE_UPDATE_CHALLENGE_ACTION ||
          challenge.walletAddress !== payload.normalizedAddress ||
          challenge.payloadHash !== payloadHash
        ) {
          throw new Error("INVALID_CHALLENGE");
        }

        if (challenge.usedAt) {
          throw new Error("CHALLENGE_USED");
        }

        if (challenge.expiresAt <= now) {
          throw new Error("CHALLENGE_EXPIRED");
        }

        const message = buildProfileUpdateChallengeMessage({
          address: payload.normalizedAddress,
          payloadHash,
          nonce: challenge.nonce,
          expiresAt: challenge.expiresAt,
        });

        const isValid = await verifyMessage({
          address: payload.normalizedAddress,
          message,
          signature: signature as `0x${string}`,
        });

        if (!isValid) {
          throw new Error("INVALID_SIGNATURE");
        }

        if (payload.hasUsername) {
          const existingUsername = await tx
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.username, payload.username!))
            .limit(1);

          if (existingUsername.length > 0 && existingUsername[0].walletAddress !== payload.normalizedAddress) {
            throw new Error("USERNAME_TAKEN");
          }
        }

        const claimedChallenge = await tx
          .update(signedActionChallenges)
          .set({ usedAt: now })
          .where(and(eq(signedActionChallenges.id, challenge.id), isNull(signedActionChallenges.usedAt)))
          .returning({ id: signedActionChallenges.id });

        if (claimedChallenge.length === 0) {
          throw new Error("CHALLENGE_USED");
        }

        const existingProfile = await tx
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.walletAddress, payload.normalizedAddress))
          .limit(1);

        const updateData: { username?: string; profileImageUrl?: string | null; updatedAt: Date } = {
          updatedAt: now,
        };
        if (payload.hasUsername) {
          updateData.username = payload.username!;
        }
        if (payload.hasProfileImage) {
          updateData.profileImageUrl = payload.profileImageUrl ?? null;
        }

        if (existingProfile.length > 0) {
          await tx
            .update(userProfiles)
            .set(updateData)
            .where(eq(userProfiles.walletAddress, payload.normalizedAddress));
        } else {
          if (!payload.hasUsername) {
            throw new Error("USERNAME_REQUIRED");
          }

          await tx.insert(userProfiles).values({
            walletAddress: payload.normalizedAddress,
            username: payload.username!,
            profileImageUrl: payload.hasProfileImage ? (payload.profileImageUrl ?? null) : null,
            createdAt: now,
            updatedAt: now,
          });
        }
      });
    } catch (error: any) {
      if (error.message === "USERNAME_TAKEN") {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      if (error.message === "USERNAME_REQUIRED") {
        return NextResponse.json({ error: "Username is required for new profiles" }, { status: 400 });
      }
      if (error.message === "CHALLENGE_USED") {
        return NextResponse.json({ error: "Challenge already used" }, { status: 409 });
      }
      if (error.message === "CHALLENGE_EXPIRED") {
        return NextResponse.json({ error: "Challenge expired" }, { status: 401 });
      }
      if (error.message === "INVALID_CHALLENGE" || error.message === "INVALID_SIGNATURE") {
        return NextResponse.json({ error: "Invalid signature challenge" }, { status: 401 });
      }
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.message?.includes("UNIQUE constraint failed")) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      throw error;
    }

    const updatedProfile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.walletAddress, payload.normalizedAddress))
      .limit(1);

    return NextResponse.json({
      success: true,
      username: updatedProfile[0]?.username,
      profileImageUrl: updatedProfile[0]?.profileImageUrl || null,
    });
  } catch (error) {
    console.error("Error setting profile:", error);
    return NextResponse.json({ error: "Failed to set profile" }, { status: 500 });
  }
}
