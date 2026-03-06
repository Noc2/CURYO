import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import {
  addWatchedContent,
  isValidWalletAddress,
  listWatchedContent,
  normalizeContentId,
  normalizeWalletAddress,
  removeWatchedContent,
} from "~~/lib/watchlist/contentWatch";
import { buildUnwatchContentMessage, buildWatchContentMessage } from "~~/lib/watchlist/messages";
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
    const items = await listWatchedContent(normalizedAddress);
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching watched content:", error);
    return NextResponse.json({ error: "Failed to fetch watched content" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, contentId, signature } = await request.json();
    const normalizedContentId = normalizeContentId(contentId);

    if (!address || !signature || !normalizedContentId || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(address);
    const message = buildWatchContentMessage(normalizedContentId);
    const isValid = await verifyMessage({
      address: normalizedAddress,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    await addWatchedContent(normalizedAddress, normalizedContentId);
    return NextResponse.json({ ok: true, watched: true, contentId: normalizedContentId });
  } catch (error) {
    console.error("Error watching content:", error);
    return NextResponse.json({ error: "Failed to watch content" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const { address, contentId, signature } = await request.json();
    const normalizedContentId = normalizeContentId(contentId);

    if (!address || !signature || !normalizedContentId || !isValidWalletAddress(address)) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalizedAddress = normalizeWalletAddress(address);
    const message = buildUnwatchContentMessage(normalizedContentId);
    const isValid = await verifyMessage({
      address: normalizedAddress,
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    await removeWatchedContent(normalizedAddress, normalizedContentId);
    return NextResponse.json({ ok: true, watched: false, contentId: normalizedContentId });
  } catch (error) {
    console.error("Error unwatching content:", error);
    return NextResponse.json({ error: "Failed to unwatch content" }, { status: 500 });
  }
}
