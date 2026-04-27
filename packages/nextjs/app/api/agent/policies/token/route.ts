import { NextRequest, NextResponse } from "next/server";
import { AgentPolicyLifecycleError, revokeAgentPolicyToken, rotateAgentPolicyToken } from "~~/lib/agent/policies";
import {
  REVOKE_AGENT_POLICY_TOKEN_ACTION,
  ROTATE_AGENT_POLICY_TOKEN_ACTION,
  buildAgentPolicyChallengeMessage,
  hashAgentPolicyManagementPayload,
  normalizeAgentPolicyManagementInput,
} from "~~/lib/auth/agentPolicies";
import { createSignedReadResponse, verifySignedActionChallenge } from "~~/lib/auth/signedRouteHelpers";
import { checkRateLimit } from "~~/utils/rateLimit";

const WRITE_RATE_LIMIT = { limit: 20, windowMs: 60_000 };

function buildMcpConfig(token: string, request: NextRequest) {
  return {
    mcpServers: {
      curyo: {
        url: new URL("/api/mcp", request.url).toString(),
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    },
  };
}

async function verifyManagementAction(
  body: Record<string, unknown> & { signature?: `0x${string}`; challengeId?: string },
  action: typeof ROTATE_AGENT_POLICY_TOKEN_ACTION | typeof REVOKE_AGENT_POLICY_TOKEN_ACTION,
) {
  if (!body.signature || !body.challengeId) {
    return { ok: false as const, response: NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 }) };
  }

  const normalized = normalizeAgentPolicyManagementInput(body);
  if (!normalized.ok) {
    return { ok: false as const, response: NextResponse.json({ error: normalized.error }, { status: 400 }) };
  }

  const payloadHash = hashAgentPolicyManagementPayload(normalized.payload);
  const challengeFailure = await verifySignedActionChallenge({
    challengeId: String(body.challengeId),
    action,
    walletAddress: normalized.payload.normalizedAddress,
    payloadHash,
    signature: body.signature,
    buildMessage: ({ nonce, expiresAt }) =>
      buildAgentPolicyChallengeMessage({
        action,
        address: normalized.payload.normalizedAddress,
        payloadHash,
        nonce,
        expiresAt,
      }),
  });
  if (challengeFailure) return { ok: false as const, response: challengeFailure };

  return { ok: true as const, payload: normalized.payload };
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown> & { signature?: `0x${string}`; challengeId?: string };
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
    extraKeyParts: [typeof body.address === "string" ? body.address : undefined, "rotate_token"],
  });
  if (limited) return limited;

  try {
    const verified = await verifyManagementAction(body, ROTATE_AGENT_POLICY_TOKEN_ACTION);
    if (!verified.ok) return verified.response;

    const { policy, token } = await rotateAgentPolicyToken({
      ownerWalletAddress: verified.payload.normalizedAddress,
      policyId: verified.payload.policyId,
    });
    return createSignedReadResponse(verified.payload.normalizedAddress, "agent_policies", {
      ok: true,
      policy,
      token,
      mcpConfig: buildMcpConfig(token, request),
    });
  } catch (error) {
    if (error instanceof AgentPolicyLifecycleError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Error rotating agent policy token:", error);
    return NextResponse.json({ error: "Failed to rotate agent policy token" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown> & { signature?: `0x${string}`; challengeId?: string };
  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
    extraKeyParts: [typeof body.address === "string" ? body.address : undefined, "revoke_token"],
  });
  if (limited) return limited;

  try {
    const verified = await verifyManagementAction(body, REVOKE_AGENT_POLICY_TOKEN_ACTION);
    if (!verified.ok) return verified.response;

    const policy = await revokeAgentPolicyToken({
      ownerWalletAddress: verified.payload.normalizedAddress,
      policyId: verified.payload.policyId,
    });
    return createSignedReadResponse(verified.payload.normalizedAddress, "agent_policies", { ok: true, policy });
  } catch (error) {
    console.error("Error revoking agent policy token:", error);
    return NextResponse.json({ error: "Failed to revoke agent policy token" }, { status: 500 });
  }
}
