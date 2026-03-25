import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getThirdwebClientId, getThirdwebServerVerifierSecret } from "~~/lib/env/server";
import {
  type FreeTransactionAllowanceDecision,
  evaluateFreeTransactionAllowance,
} from "~~/lib/thirdweb/freeTransactions";

function getVerifierRequestSummary(body: Record<string, unknown>) {
  const userOp = (body.userOp ?? {}) as {
    sender?: unknown;
    targets?: unknown;
    data?: { targets?: unknown };
  };
  const directTargets = Array.isArray(userOp.targets) ? userOp.targets : [];
  const nestedTargets = Array.isArray(userOp.data?.targets) ? userOp.data.targets : [];
  const targets = [...directTargets, ...nestedTargets].filter((value): value is string => typeof value === "string");

  return {
    chainId: typeof body.chainId === "number" ? body.chainId : null,
    clientId: typeof body.clientId === "string" ? body.clientId : null,
    sender: typeof userOp.sender === "string" ? userOp.sender : null,
    targetCount: targets.length,
    targets,
  };
}

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
    console.error("[thirdweb-verifier] denied request", {
      debugCode: "missing_server_secret",
    });
    return createDeniedResponse("Transactions are not sponsored right now.");
  }

  if (
    !providedSecret ||
    providedSecret.length !== configuredSecret.length ||
    !timingSafeEqual(Buffer.from(providedSecret), Buffer.from(configuredSecret))
  ) {
    console.warn("[thirdweb-verifier] denied request", {
      debugCode: "invalid_verifier_secret",
      hasProvidedSecret: Boolean(providedSecret),
    });
    return createDeniedResponse("Unauthorized");
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return createDeniedResponse("Invalid request.");
  }

  const requestSummary = getVerifierRequestSummary(body);
  console.info("[thirdweb-verifier] request received", requestSummary);

  const configuredClientId = getThirdwebClientId();
  if (configuredClientId && body.clientId !== configuredClientId) {
    console.warn("[thirdweb-verifier] denied request", {
      ...requestSummary,
      debugCode: "client_id_mismatch",
      expectedClientId: configuredClientId,
    });
    return createDeniedResponse("Transactions are not sponsored right now.");
  }

  try {
    const decision = (await evaluateFreeTransactionAllowance(body as never)) as FreeTransactionAllowanceDecision;

    if (!decision.isAllowed) {
      console.warn("[thirdweb-verifier] denied request", {
        ...requestSummary,
        debugCode: decision.debugCode,
        reason: decision.reason,
        summary: decision.summary,
      });
      return createDeniedResponse(decision.reason);
    }

    if (requestSummary.chainId === 42220) {
      console.info("[thirdweb-verifier] approved mainnet request", requestSummary);
    }

    return NextResponse.json({ isAllowed: true });
  } catch (error) {
    console.error("[thirdweb-verifier] request failed", {
      ...requestSummary,
      error,
    });
    return createDeniedResponse("Transactions are not sponsored right now.");
  }
}
