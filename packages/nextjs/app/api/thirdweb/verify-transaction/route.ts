import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getThirdwebClientId, getThirdwebServerVerifierSecret } from "~~/lib/env/server";
import {
  type FreeTransactionAllowanceDecision,
  evaluateFreeTransactionAllowance,
} from "~~/lib/thirdweb/freeTransactions";

function createDeniedResponse(reason: string) {
  return NextResponse.json({
    isAllowed: false,
    reason,
  });
}

export async function POST(request: NextRequest) {
  const configuredSecret = getThirdwebServerVerifierSecret();
  const providedSecret = request.headers.get("x-thirdweb-verifier-secret");

  if (!configuredSecret) {
    console.error("Thirdweb server verifier secret is missing.");
    return createDeniedResponse("Transactions are not sponsored right now.");
  }

  if (
    !providedSecret ||
    providedSecret.length !== configuredSecret.length ||
    !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(configuredSecret))
  ) {
    return createDeniedResponse("Unauthorized");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return createDeniedResponse("Invalid request.");
  }

  const configuredClientId = getThirdwebClientId();
  if (configuredClientId && body.clientId !== configuredClientId) {
    return createDeniedResponse("Transactions are not sponsored right now.");
  }

  try {
    const decision = (await evaluateFreeTransactionAllowance(body as never)) as FreeTransactionAllowanceDecision;

    if (!decision.isAllowed) {
      return createDeniedResponse(decision.reason);
    }

    return NextResponse.json({ isAllowed: true });
  } catch (error) {
    console.error("Thirdweb verifier failed:", error);
    return createDeniedResponse("Transactions are not sponsored right now.");
  }
}
