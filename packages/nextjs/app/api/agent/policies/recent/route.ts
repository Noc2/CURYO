import { NextRequest, NextResponse } from "next/server";
import { listAgentAskSummaries } from "~~/lib/agent/policies";
import { normalizeAgentPoliciesReadInput } from "~~/lib/auth/agentPolicies";
import {
  AGENT_POLICIES_SIGNED_READ_SESSION_COOKIE_NAME,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const policyId = request.nextUrl.searchParams.get("policyId")?.trim();
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined, policyId],
  });
  if (limited) return limited;

  try {
    const normalized = normalizeAgentPoliciesReadInput({ address: typeof address === "string" ? address : undefined });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    if (!policyId) {
      return NextResponse.json({ error: "Invalid agent policy id" }, { status: 400 });
    }

    const hasSession = await verifySignedReadSession(
      request.cookies.get(AGENT_POLICIES_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalized.payload.normalizedAddress,
      "agent_policies",
    );
    if (!hasSession) {
      return NextResponse.json({ error: "Signed read required" }, { status: 401 });
    }

    const limit = Number(request.nextUrl.searchParams.get("limit") ?? 10);
    const items = await listAgentAskSummaries({
      ownerWalletAddress: normalized.payload.normalizedAddress,
      policyId,
      limit,
    });
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching recent agent asks:", error);
    return NextResponse.json({ error: "Failed to fetch recent agent asks" }, { status: 500 });
  }
}
