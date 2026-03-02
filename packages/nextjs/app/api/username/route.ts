import { NextRequest, NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { verifyMessage } from "viem";
import { db } from "~~/lib/db";
import { userProfiles } from "~~/lib/db/schema";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 10, windowMs: 60_000 };

// GET: Fetch username(s) for address(es)
// Query params: ?address=0x... or ?addresses=0x...,0x...
export async function GET(request: NextRequest) {
  const limited = checkRateLimit(request, READ_RATE_LIMIT);
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

// Helper to validate image URL format
function isValidImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

// POST: Set/update profile (username and/or profile image) with wallet signature
export async function POST(request: NextRequest) {
  const limited = checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, username, profileImageUrl, signature } = await request.json();

    // Validate required fields - need address, signature, and at least one field to update
    if (!address || !signature) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // At least one of username or profileImageUrl must be provided
    const hasUsername = username !== undefined && username !== null;
    const hasProfileImage = profileImageUrl !== undefined;

    if (!hasUsername && !hasProfileImage) {
      return NextResponse.json({ error: "Must provide username or profileImageUrl" }, { status: 400 });
    }

    // Validate username format if provided
    if (hasUsername) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
      if (!usernameRegex.test(username)) {
        return NextResponse.json(
          { error: "Username must be 3-20 characters (letters, numbers, underscores only)" },
          { status: 400 },
        );
      }
    }

    // Validate profile image URL if provided (empty string means remove)
    if (hasProfileImage && profileImageUrl !== "" && profileImageUrl !== null) {
      if (!isValidImageUrl(profileImageUrl)) {
        return NextResponse.json({ error: "Invalid image URL format (must be http or https)" }, { status: 400 });
      }
    }

    // Build signature message based on what's being updated
    const messageParts: string[] = [];
    if (hasUsername) {
      messageParts.push(`Set Curyo username to: ${username}`);
    }
    if (hasProfileImage) {
      if (profileImageUrl && profileImageUrl !== "") {
        messageParts.push(`Set profile image to: ${profileImageUrl}`);
      } else {
        messageParts.push("Remove profile image");
      }
    }
    const message = messageParts.join("\n");

    // Verify the signature
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

    try {
      await db.transaction(async tx => {
        // Check if username is already taken by another address (if updating username)
        if (hasUsername) {
          const existingUsername = await tx
            .select()
            .from(userProfiles)
            .where(eq(userProfiles.username, username))
            .limit(1);

          if (existingUsername.length > 0 && existingUsername[0].walletAddress !== normalizedAddress) {
            throw new Error("USERNAME_TAKEN");
          }
        }

        // Check if user already has a profile
        const existingProfile = await tx
          .select()
          .from(userProfiles)
          .where(eq(userProfiles.walletAddress, normalizedAddress))
          .limit(1);

        // Build update data
        const updateData: { username?: string; profileImageUrl?: string | null; updatedAt: Date } = {
          updatedAt: now,
        };
        if (hasUsername) {
          updateData.username = username;
        }
        if (hasProfileImage) {
          updateData.profileImageUrl = profileImageUrl === "" ? null : profileImageUrl;
        }

        if (existingProfile.length > 0) {
          // Update existing profile
          await tx.update(userProfiles).set(updateData).where(eq(userProfiles.walletAddress, normalizedAddress));
        } else {
          // Create new profile - username is required for new profiles
          if (!hasUsername) {
            throw new Error("USERNAME_REQUIRED");
          }
          await tx.insert(userProfiles).values({
            walletAddress: normalizedAddress,
            username,
            profileImageUrl: profileImageUrl === "" ? null : profileImageUrl || null,
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
      // Catch unique constraint violations from race conditions
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE" || error.message?.includes("UNIQUE constraint failed")) {
        return NextResponse.json({ error: "Username already taken" }, { status: 409 });
      }
      throw error;
    }

    // Fetch updated profile to return
    const updatedProfile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.walletAddress, normalizedAddress))
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
