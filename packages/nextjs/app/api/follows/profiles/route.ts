import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import {
  addFollowedProfile,
  isValidWalletAddress,
  listFollowedProfiles,
  normalizeWalletAddress,
  removeFollowedProfile,
} from "~~/lib/social/profileFollows";
import { buildFollowProfileMessage, buildUnfollowProfileMessage } from "~~/lib/watchlist/messages";
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
    const { address, targetAddress, signature } = await request.json();

    if (
      !address ||
      !targetAddress ||
      !signature ||
      !isValidWalletAddress(address) ||
      !isValidWalletAddress(targetAddress)
    ) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(address);
    const normalizedTargetAddress = normalizeWalletAddress(targetAddress);

    if (normalizedAddress === normalizedTargetAddress) {
      return NextResponse.json({ error: "You cannot follow yourself" }, { status: 400 });
    }

    const message = buildFollowProfileMessage(normalizedTargetAddress);
    const isValid = await verifyMessage({
      address: normalizedAddress,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    await addFollowedProfile(normalizedAddress, normalizedTargetAddress);
    return NextResponse.json({ ok: true, following: true, walletAddress: normalizedTargetAddress });
  } catch (error) {
    console.error("Error following profile:", error);
    return NextResponse.json({ error: "Failed to follow profile" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, targetAddress, signature } = await request.json();

    if (
      !address ||
      !targetAddress ||
      !signature ||
      !isValidWalletAddress(address) ||
      !isValidWalletAddress(targetAddress)
    ) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(address);
    const normalizedTargetAddress = normalizeWalletAddress(targetAddress);
    const message = buildUnfollowProfileMessage(normalizedTargetAddress);
    const isValid = await verifyMessage({
      address: normalizedAddress,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    await removeFollowedProfile(normalizedAddress, normalizedTargetAddress);
    return NextResponse.json({ ok: true, following: false, walletAddress: normalizedTargetAddress });
  } catch (error) {
    console.error("Error unfollowing profile:", error);
    return NextResponse.json({ error: "Failed to unfollow profile" }, { status: 500 });
  }
}
