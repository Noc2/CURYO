import { NextRequest, NextResponse } from "next/server";
import { AgentPolicyLifecycleError, type AgentPolicyStatus, updateAgentPolicyStatus } from "~~/lib/agent/policies";
import {
  PAUSE_AGENT_POLICY_ACTION,
  RESUME_AGENT_POLICY_ACTION,
  REVOKE_AGENT_POLICY_ACTION,
  buildAgentPolicyChallengeMessage,
  hashAgentPolicyManagementPayload,
  normalizeAgentPolicyManagementInput,
} from "~~/lib/auth/agentPolicies";
import { createSignedReadResponse, verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import { checkRateLimit } from "~~/utils/rateLimit";

const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

const STATUS_BY_ACTION = {
  pause: { signedAction: PAUSE_AGENT_POLICY_ACTION, status: "paused" },
  resume: { signedAction: RESUME_AGENT_POLICY_ACTION, status: "active" },
  revoke: { signedAction: REVOKE_AGENT_POLICY_ACTION, status: "revoked" },
} as const satisfies Record<string, { signedAction: string; status: AgentPolicyStatus }>;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown> & {
    action?: string;
    signature?: `0x${string}`;
    challengeId?: string;
  };
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
    extraKeyParts: [
      typeof body.address === "string" ? body.address : undefined,
      typeof body.action === "string" ? body.action : undefined,
    ],
  });
  if (limited) return limited;

  try {
    const statusAction =
      typeof body.action === "string" ? STATUS_BY_ACTION[body.action as keyof typeof STATUS_BY_ACTION] : null;
    if (!statusAction) {
      return NextResponse.json({ error: "Invalid managed agent status action" }, { status: 400 });
    }
    if (!body.signature || !body.challengeId) {
      return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const normalized = normalizeAgentPolicyManagementInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const payloadHash = hashAgentPolicyManagementPayload(normalized.payload);
    const challengeFailure = await verifySignedActionChallenge({
      challengeId: String(body.challengeId),
      action: statusAction.signedAction,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash,
      signature: body.signature,
      buildMessage: ({ nonce, expiresAt }) =>
        buildAgentPolicyChallengeMessage({
          action: statusAction.signedAction,
          address: normalized.payload.normalizedAddress,
          payloadHash,
          nonce,
          expiresAt,
        }),
    });
    if (challengeFailure) return challengeFailure;

    const policy = await updateAgentPolicyStatus({
      ownerWalletAddress: normalized.payload.normalizedAddress,
      policyId: normalized.payload.policyId,
      status: statusAction.status,
    });
    return createSignedReadResponse(normalized.payload.normalizedAddress, "agent_policies", { ok: true, policy });
  } catch (error) {
    if (error instanceof AgentPolicyLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error updating agent policy status:", error);
    return NextResponse.json({ error: "Failed to update agent policy status" }, { status: 500 });
  }
}
