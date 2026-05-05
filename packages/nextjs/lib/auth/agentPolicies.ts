import "server-only";
import { type NormalizedAgentPolicyInput, normalizeAgentPolicyInput } from "~~/lib/agent/policies";
import { buildSignedActionMessage, hashSignedActionPayload } from "~~/lib/auth/signedActions";
import { isValidWalletAddress, normalizeWalletAddress } from "~~/lib/watchlist/contentWatch";

export const AGENT_POLICIES_CHALLENGE_TITLE = "Curyo managed agents";
export const READ_AGENT_POLICIES_ACTION = "agent_policies:read";
export const SAVE_AGENT_POLICY_ACTION = "agent_policies:save";
export const ROTATE_AGENT_POLICY_TOKEN_ACTION = "agent_policies:rotate_token";
export const REVOKE_AGENT_POLICY_TOKEN_ACTION = "agent_policies:revoke_token";
export const PAUSE_AGENT_POLICY_ACTION = "agent_policies:pause";
export const RESUME_AGENT_POLICY_ACTION = "agent_policies:resume";
export const REVOKE_AGENT_POLICY_ACTION = "agent_policies:revoke";

export const AGENT_POLICY_MANAGEMENT_ACTIONS = [
  ROTATE_AGENT_POLICY_TOKEN_ACTION,
  REVOKE_AGENT_POLICY_TOKEN_ACTION,
  PAUSE_AGENT_POLICY_ACTION,
  RESUME_AGENT_POLICY_ACTION,
  REVOKE_AGENT_POLICY_ACTION,
] as const;

export type AgentPolicyManagementAction = (typeof AGENT_POLICY_MANAGEMENT_ACTIONS)[number];

export type AgentPoliciesReadPayload = {
  normalizedAddress: `0x${string}`;
};

export type AgentPolicySavePayload = AgentPoliciesReadPayload & {
  policy: NormalizedAgentPolicyInput;
};

export type AgentPolicyManagementPayload = AgentPoliciesReadPayload & {
  policyId: string;
};

type NormalizedResult<TPayload> = { ok: true; payload: TPayload } | { ok: false; error: string };

function normalizeOwnerAddress(body: Record<string, unknown>): NormalizedResult<AgentPoliciesReadPayload> {
  if (!body.address || typeof body.address !== "string" || !isValidWalletAddress(body.address)) {
    return { ok: false, error: "Invalid wallet address" };
  }

  return {
    ok: true,
    payload: {
      normalizedAddress: normalizeWalletAddress(body.address),
    },
  };
}

function normalizePolicyId(value: unknown): string | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > 0 && raw.length <= 128 ? raw : null;
}

export function normalizeAgentPoliciesReadInput(
  body: Record<string, unknown>,
): NormalizedResult<AgentPoliciesReadPayload> {
  return normalizeOwnerAddress(body);
}

export function normalizeAgentPolicySaveInput(body: Record<string, unknown>): NormalizedResult<AgentPolicySavePayload> {
  const owner = normalizeOwnerAddress(body);
  if (!owner.ok) return owner;

  try {
    const policy = normalizeAgentPolicyInput({
      agentId: typeof body.agentId === "string" ? body.agentId : "",
      agentWalletAddress: typeof body.agentWalletAddress === "string" ? body.agentWalletAddress : "",
      categories: Array.isArray(body.categories) ? body.categories.map(String) : [],
      dailyBudgetAtomic: typeof body.dailyBudgetAtomic === "string" ? body.dailyBudgetAtomic : "",
      expiresAt: typeof body.expiresAt === "string" || body.expiresAt === null ? body.expiresAt : null,
      perAskLimitAtomic: typeof body.perAskLimitAtomic === "string" ? body.perAskLimitAtomic : "",
      policyId: typeof body.policyId === "string" ? body.policyId : null,
      scopes: Array.isArray(body.scopes) ? body.scopes.map(String) : [],
    });
    return { ok: true, payload: { ...owner.payload, policy } };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Invalid agent policy" };
  }
}

export function normalizeAgentPolicyManagementInput(
  body: Record<string, unknown>,
): NormalizedResult<AgentPolicyManagementPayload> {
  const owner = normalizeOwnerAddress(body);
  if (!owner.ok) return owner;

  const policyId = normalizePolicyId(body.policyId);
  if (!policyId) {
    return { ok: false, error: "Invalid agent policy id" };
  }

  return { ok: true, payload: { ...owner.payload, policyId } };
}

export function hashAgentPoliciesReadPayload(payload: AgentPoliciesReadPayload) {
  return hashSignedActionPayload([payload.normalizedAddress]);
}

export function hashAgentPolicySavePayload(payload: AgentPolicySavePayload) {
  const policy = payload.policy;
  return hashSignedActionPayload([
    payload.normalizedAddress,
    policy.policyId ?? "",
    policy.agentId,
    policy.agentWalletAddress,
    policy.dailyBudgetAtomic,
    policy.perAskLimitAtomic,
    policy.categories.join(","),
    policy.scopes.join(","),
    policy.expiresAt ? policy.expiresAt.toISOString() : "",
  ]);
}

export function hashAgentPolicyManagementPayload(payload: AgentPolicyManagementPayload) {
  return hashSignedActionPayload([payload.normalizedAddress, payload.policyId]);
}

export function buildAgentPolicyChallengeMessage(params: {
  action: string;
  address: `0x${string}`;
  payloadHash: string;
  nonce: string;
  expiresAt: Date;
}) {
  return buildSignedActionMessage({
    title: AGENT_POLICIES_CHALLENGE_TITLE,
    action: params.action,
    address: params.address,
    payloadHash: params.payloadHash,
    nonce: params.nonce,
    expiresAt: params.expiresAt,
  });
}
