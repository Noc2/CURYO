import { NextRequest, NextResponse } from "next/server";
import { sanitizeSelfVerificationTelemetry } from "~~/lib/governance/selfVerificationTelemetry";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT, {
    allowOnStoreUnavailable: true,
  });
  if (limited) {
    return limited;
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const telemetry = sanitizeSelfVerificationTelemetry(body);
  if (!telemetry) {
    return NextResponse.json({ error: "Invalid telemetry event." }, { status: 400 });
  }

  const logPayload = {
    ...telemetry,
    deploymentUrl: process.env.VERCEL_URL ?? null,
    gitCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };

  if (telemetry.event.includes("failed") || telemetry.event.includes("timeout")) {
    console.warn("[self-verification] event", logPayload);
  } else {
    console.info("[self-verification] event", logPayload);
  }

  return NextResponse.json({ ok: true });
}
