"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { ensurePrivateAccountReadSession } from "~~/hooks/usePrivateAccountSession";
import { isSignatureRejected } from "~~/utils/signatureErrors";

export type AgentPolicyStatus = "active" | "paused" | "revoked";

export type AgentPolicyRecord = {
  agentId: string;
  agentWalletAddress: `0x${string}`;
  categories: string[];
  createdAt: string;
  dailyBudgetAtomic: string;
  expiresAt: string | null;
  hasToken: boolean;
  id: string;
  ownerWalletAddress: `0x${string}`;
  perAskLimitAtomic: string;
  revokedAt: string | null;
  scopes: string[];
  status: AgentPolicyStatus;
  tokenIssuedAt: string | null;
  tokenRevokedAt: string | null;
  updatedAt: string;
};

export type AgentAskSummary = {
  categoryId: string;
  chainId: number;
  clientRequestId: string;
  contentId: string | null;
  createdAt: string;
  error: string | null;
  operationKey: `0x${string}`;
  paymentAmount: string;
  status: string;
  updatedAt: string;
};

export type AgentPolicySaveInput = {
  agentId: string;
  agentWalletAddress: string;
  categories: string[];
  dailyBudgetAtomic: string;
  expiresAt?: string | null;
  perAskLimitAtomic: string;
  policyId?: string | null;
  scopes: string[];
};

export type AgentPolicyMutationResult = {
  ok: boolean;
  error?: string;
  policy?: AgentPolicyRecord;
  reason?: "not_connected" | "rejected" | "request_failed";
};

export type AgentPolicyTokenResult = AgentPolicyMutationResult & {
  token?: string;
  mcpConfig?: unknown;
};

type AgentPoliciesResponse = {
  count: number;
  hasSession: boolean;
  items: AgentPolicyRecord[];
};

type ChallengeResponse = {
  challengeId?: string;
  error?: string;
  message?: string;
};

type UseAgentPoliciesOptions = {
  autoRead?: boolean;
};

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(body?.error || fallback);
  }
  return body as T;
}

async function requestSignedChallenge(params: {
  address: string;
  body: Record<string, unknown>;
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>;
}) {
  const challenge = await readJson<ChallengeResponse>(
    await fetch("/api/agent/policies/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: params.address, ...params.body }),
    }),
    "Failed to create signature challenge",
  );

  if (!challenge.message || !challenge.challengeId) {
    throw new Error(challenge.error || "Failed to create signature challenge");
  }

  const signature = await params.signMessageAsync({ message: challenge.message });
  return { challengeId: challenge.challengeId, signature };
}

async function readAgentPolicies(
  address: string,
  signMessageAsync: (args: { message: string }) => Promise<`0x${string}`>,
  autoRead: boolean,
): Promise<AgentPoliciesResponse> {
  const session = await readJson<{ hasSession?: boolean }>(
    await fetch(`/api/agent/policies/session?address=${encodeURIComponent(address)}`),
    "Failed to check managed agent session",
  );

  if (session.hasSession) {
    const policies = await readJson<{ items?: AgentPolicyRecord[]; count?: number }>(
      await fetch(`/api/agent/policies?address=${encodeURIComponent(address)}`),
      "Failed to fetch managed agents",
    );
    const items = policies.items ?? [];
    return { items, count: policies.count ?? items.length, hasSession: true };
  }

  if (!autoRead) {
    return { items: [], count: 0, hasSession: false };
  }

  await ensurePrivateAccountReadSession(address, signMessageAsync);
  const policies = await readJson<{ items?: AgentPolicyRecord[]; count?: number }>(
    await fetch(`/api/agent/policies?address=${encodeURIComponent(address)}`),
    "Failed to fetch managed agents",
  );
  const items = policies.items ?? [];
  return { items, count: policies.count ?? items.length, hasSession: true };
}

export function useAgentPolicies(address?: string, options?: UseAgentPoliciesOptions) {
  const { signMessageAsync } = useSignMessage();
  const [isSaving, setIsSaving] = useState(false);
  const [isTokenBusy, setIsTokenBusy] = useState(false);
  const [isStatusBusy, setIsStatusBusy] = useState(false);
  const autoRead = options?.autoRead ?? false;
  const queryKey = useMemo(() => ["agentPolicies", address] as const, [address]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!address) return { items: [], count: 0, hasSession: false };
      try {
        return await readAgentPolicies(address, signMessageAsync, autoRead);
      } catch (error) {
        if (isSignatureRejected(error)) return { items: [], count: 0, hasSession: false };
        throw error;
      }
    },
    enabled: Boolean(address),
    staleTime: 30_000,
    retry: false,
  });

  const savePolicy = useCallback(
    async (policy: AgentPolicySaveInput): Promise<AgentPolicyMutationResult> => {
      if (!address) return { ok: false, reason: "not_connected" };
      setIsSaving(true);
      try {
        const signed = await requestSignedChallenge({
          address,
          body: { intent: "save", ...policy },
          signMessageAsync,
        });
        const body = await readJson<{ ok?: boolean; policy?: AgentPolicyRecord }>(
          await fetch("/api/agent/policies", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, ...policy, ...signed }),
          }),
          "Failed to save managed agent",
        );
        await refetch();
        return { ok: true, policy: body.policy };
      } catch (error) {
        if (isSignatureRejected(error)) return { ok: false, reason: "rejected" };
        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to save managed agent",
        };
      } finally {
        setIsSaving(false);
      }
    },
    [address, refetch, signMessageAsync],
  );

  const rotateToken = useCallback(
    async (policyId: string): Promise<AgentPolicyTokenResult> => {
      if (!address) return { ok: false, reason: "not_connected" };
      setIsTokenBusy(true);
      try {
        const signed = await requestSignedChallenge({
          address,
          body: { intent: "rotate_token", policyId },
          signMessageAsync,
        });
        const body = await readJson<{ ok?: boolean; policy?: AgentPolicyRecord; token?: string; mcpConfig?: unknown }>(
          await fetch("/api/agent/policies/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, policyId, ...signed }),
          }),
          "Failed to rotate managed agent token",
        );
        await refetch();
        return { ok: true, policy: body.policy, token: body.token, mcpConfig: body.mcpConfig };
      } catch (error) {
        if (isSignatureRejected(error)) return { ok: false, reason: "rejected" };
        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to rotate managed agent token",
        };
      } finally {
        setIsTokenBusy(false);
      }
    },
    [address, refetch, signMessageAsync],
  );

  const revokeToken = useCallback(
    async (policyId: string): Promise<AgentPolicyMutationResult> => {
      if (!address) return { ok: false, reason: "not_connected" };
      setIsTokenBusy(true);
      try {
        const signed = await requestSignedChallenge({
          address,
          body: { intent: "revoke_token", policyId },
          signMessageAsync,
        });
        const body = await readJson<{ ok?: boolean; policy?: AgentPolicyRecord }>(
          await fetch("/api/agent/policies/token", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, policyId, ...signed }),
          }),
          "Failed to revoke managed agent token",
        );
        await refetch();
        return { ok: true, policy: body.policy };
      } catch (error) {
        if (isSignatureRejected(error)) return { ok: false, reason: "rejected" };
        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to revoke managed agent token",
        };
      } finally {
        setIsTokenBusy(false);
      }
    },
    [address, refetch, signMessageAsync],
  );

  const updateStatus = useCallback(
    async (policyId: string, action: "pause" | "resume" | "revoke"): Promise<AgentPolicyMutationResult> => {
      if (!address) return { ok: false, reason: "not_connected" };
      setIsStatusBusy(true);
      try {
        const signed = await requestSignedChallenge({
          address,
          body: { intent: action, policyId },
          signMessageAsync,
        });
        const body = await readJson<{ ok?: boolean; policy?: AgentPolicyRecord }>(
          await fetch("/api/agent/policies/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, policyId, action, ...signed }),
          }),
          "Failed to update managed agent status",
        );
        await refetch();
        return { ok: true, policy: body.policy };
      } catch (error) {
        if (isSignatureRejected(error)) return { ok: false, reason: "rejected" };
        return {
          ok: false,
          reason: "request_failed",
          error: error instanceof Error ? error.message : "Failed to update managed agent status",
        };
      } finally {
        setIsStatusBusy(false);
      }
    },
    [address, refetch, signMessageAsync],
  );

  return {
    hasReadSession: data?.hasSession ?? false,
    isLoading,
    isSaving,
    isStatusBusy,
    isTokenBusy,
    policies: data?.items ?? [],
    refetch,
    revokeToken,
    rotateToken,
    savePolicy,
    updateStatus,
  };
}

export function useAgentPolicyRecentAsks(address: string | undefined, policyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ["agentPolicyRecentAsks", address, policyId] as const,
    queryFn: async () => {
      if (!address || !policyId) return [];
      const response = await readJson<{ items?: AgentAskSummary[] }>(
        await fetch(
          `/api/agent/policies/recent?address=${encodeURIComponent(address)}&policyId=${encodeURIComponent(policyId)}`,
        ),
        "Failed to fetch recent managed agent asks",
      );
      return response.items ?? [];
    },
    enabled: Boolean(address && policyId && enabled),
    staleTime: 15_000,
    retry: false,
  });
}
