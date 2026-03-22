import { NextRequest, NextResponse } from "next/server";
import { releaseFreeTransactionReservation } from "~~/lib/thirdweb/freeTransactions";
import { checkRateLimit } from "~~/utils/rateLimit";

const WRITE_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

type ReleaseFreeTransactionRequest = {
  address?: string;
  chainId?: number;
  operationKey?: string;
};

export async function POST(request: NextRequest) {
  let body: ReleaseFreeTransactionRequest | null = null;

  try {
    body = (await request.json()) as ReleaseFreeTransactionRequest;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
    extraKeyParts: [body?.address],
  });
  if (limited) return limited;

  try {
    await releaseFreeTransactionReservation({
      address: body?.address ?? "",
      chainId: typeof body?.chainId === "number" ? body.chainId : Number.NaN,
      operationKey: body?.operationKey ?? "",
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim() ? error.message : "Failed to release free transaction usage";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
