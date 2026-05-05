import { NextRequest, NextResponse } from "next/server";
import {
  AGENT_POLICIES_CHALLENGE_TITLE,
  PAUSE_AGENT_POLICY_ACTION,
  READ_AGENT_POLICIES_ACTION,
  RESUME_AGENT_POLICY_ACTION,
  REVOKE_AGENT_POLICY_ACTION,
  REVOKE_AGENT_POLICY_TOKEN_ACTION,
  ROTATE_AGENT_POLICY_TOKEN_ACTION,
  SAVE_AGENT_POLICY_ACTION,
  hashAgentPoliciesReadPayload,
  hashAgentPolicyManagementPayload,
  hashAgentPolicySavePayload,
  normalizeAgentPoliciesReadInput,
  normalizeAgentPolicyManagementInput,
  normalizeAgentPolicySaveInput,
} from "~~/lib/auth/agentPolicies";
import { issueSignedActionChallenge } from "~~/lib/auth/signedActions";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

const MANAGEMENT_ACTION_BY_INTENT = {
  pause: PAUSE_AGENT_POLICY_ACTION,
  resume: RESUME_AGENT_POLICY_ACTION,
  revoke: REVOKE_AGENT_POLICY_ACTION,
  revoke_token: REVOKE_AGENT_POLICY_TOKEN_ACTION,
  rotate_token: ROTATE_AGENT_POLICY_TOKEN_ACTION,
} as const;

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const limited = await checkRateLimit(request, RATE_LIMIT, {
    extraKeyParts: [
      typeof body.address === "string" ? body.address : undefined,
      typeof body.intent === "string" ? body.intent : typeof body.action === "string" ? body.action : undefined,
    ],
  });
  if (limited) return limited;

  try {
    if (body.intent === "read") {
      const normalized = normalizeAgentPoliciesReadInput(body);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }

      const challenge = await issueSignedActionChallenge({
        title: AGENT_POLICIES_CHALLENGE_TITLE,
        action: READ_AGENT_POLICIES_ACTION,
        walletAddress: normalized.payload.normalizedAddress,
        payloadHash: hashAgentPoliciesReadPayload(normalized.payload),
      });
      return NextResponse.json(challenge);
    }

    if (body.intent === "save") {
      const normalized = normalizeAgentPolicySaveInput(body);
      if (!normalized.ok) {
        return NextResponse.json({ error: normalized.error }, { status: 400 });
      }

      const challenge = await issueSignedActionChallenge({
        title: AGENT_POLICIES_CHALLENGE_TITLE,
        action: SAVE_AGENT_POLICY_ACTION,
        walletAddress: normalized.payload.normalizedAddress,
        payloadHash: hashAgentPolicySavePayload(normalized.payload),
      });
      return NextResponse.json(challenge);
    }

    const intent = typeof body.intent === "string" ? body.intent : typeof body.action === "string" ? body.action : "";
    const action = MANAGEMENT_ACTION_BY_INTENT[intent as keyof typeof MANAGEMENT_ACTION_BY_INTENT];
    if (!action) {
      return NextResponse.json({ error: "Invalid managed agent action" }, { status: 400 });
    }

    const normalized = normalizeAgentPolicyManagementInput(body);
    if (!normalized.ok) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }

    const challenge = await issueSignedActionChallenge({
      title: AGENT_POLICIES_CHALLENGE_TITLE,
      action,
      walletAddress: normalized.payload.normalizedAddress,
      payloadHash: hashAgentPolicyManagementPayload(normalized.payload),
    });
    return NextResponse.json(challenge);
  } catch (error) {
    console.error("Error creating agent policy challenge:", error);
    return NextResponse.json({ error: "Failed to create agent policy challenge" }, { status: 500 });
  }
}
