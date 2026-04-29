import { NextRequest, NextResponse } from "next/server";
import { AgentPolicyLifecycleError, listAgentPolicies, upsertAgentPolicy } from "~~/lib/agent/policies";
import {
  READ_AGENT_POLICIES_ACTION,
  SAVE_AGENT_POLICY_ACTION,
  buildAgentPolicyChallengeMessage,
  hashAgentPoliciesReadPayload,
  hashAgentPolicySavePayload,
  normalizeAgentPoliciesReadInput,
  normalizeAgentPolicySaveInput,
} from "~~/lib/auth/agentPolicies";
import {
  AGENT_POLICIES_SIGNED_READ_SESSION_COOKIE_NAME,
  verifySignedReadSession,
} from "~~/lib/auth/signedReadSessions";
import { createSignedReadResponse, verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import { checkRateLimit } from "~~/utils/rateLimit";

const READ_RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, {
    extraKeyParts: [typeof address === "string" ? address : undefined],
  });
  if (limited) return limited;

  try {
    const normalized = normalizeAgentPoliciesReadInput({ address: typeof address === "string" ? address : undefined });
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const hasSession = await verifySignedReadSession(
      request.cookies.get(AGENT_POLICIES_SIGNED_READ_SESSION_COOKIE_NAME)?.value,
      normalized.payload.normalizedAddress,
      "agent_policies",
    );
    if (!hasSession) {
      return NextResponse.json({ error: "Signed read required" }, { status: 401 });
    }

    const items = await listAgentPolicies(normalized.payload.normalizedAddress);
    return NextResponse.json({ items, count: items.length });
  } catch (error) {
    console.error("Error fetching agent policies:", error);
    return NextResponse.json({ error: "Failed to fetch agent policies" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      signature?: `0x${string}`;
      challengeId?: string;
    };
    if (!body.signature || !body.challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeAgentPoliciesReadInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payloadHash = hashAgentPoliciesReadPayload(normalized.payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: READ_AGENT_POLICIES_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash,
      signature: body.signature,
      buildMessage: ({ nonce, expiresAt }) =>
        buildAgentPolicyChallengeMessage({
          action: READ_AGENT_POLICIES_ACTION,
          address: normalized.payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) return challengeFailure;

    const items = await listAgentPolicies(normalized.payload.normalizedAddress);
    return createSignedReadResponse(normalized.payload.normalizedAddress, "agent_policies", {
      items,
      count: items.length,
    });
  } catch (error) {
    console.error("Error fetching agent policies:", error);
    return NextResponse.json({ error: "Failed to fetch agent policies" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT);
  if (limited) return limited;

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      signature?: `0x${string}`;
      challengeId?: string;
    };
    if (!body.signature || !body.challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeAgentPolicySaveInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payloadHash = hashAgentPolicySavePayload(normalized.payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: SAVE_AGENT_POLICY_ACTION,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash,
      signature: body.signature,
      buildMessage: ({ nonce, expiresAt }) =>
        buildAgentPolicyChallengeMessage({
          action: SAVE_AGENT_POLICY_ACTION,
          address: normalized.payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) return challengeFailure;

    const policy = await upsertAgentPolicy(normalized.payload.normalizedAddress, normalized.payload.policy);
    return createSignedReadResponse(normalized.payload.normalizedAddress, "agent_policies", { ok: true, policy });
  } catch (error) {
    if (error instanceof AgentPolicyLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error saving agent policy:", error);
    return NextResponse.json({ error: "Failed to save agent policy" }, { status: 500 });
  }
}
