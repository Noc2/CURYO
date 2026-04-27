"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { defineChain } from "thirdweb";
import { BuyWidget } from "thirdweb/react";
import { erc20Abi } from "viem";
import { useAccount, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardDocumentIcon,
  CpuChipIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  NoSymbolIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import {
  type AgentAskSummary,
  type AgentPolicyRecord,
  useAgentPolicies,
  useAgentPolicyRecentAsks,
} from "~~/hooks/useAgentPolicies";
import { useCategoryRegistry } from "~~/hooks/useCategoryRegistry";
import {
  ERC20_APPROVAL_ABI,
  formatSubmissionRewardAmount,
  getConfiguredQuestionRewardPoolEscrowAddress,
  getDefaultUsdcAddress,
  parseSubmissionRewardAmount,
} from "~~/lib/questionRewardPools";
import { thirdwebClient } from "~~/services/thirdweb/client";
import { notification } from "~~/utils/scaffold-eth";

const CELO_MAINNET_CHAIN_ID = 42220;
const DEFAULT_FUNDING_AMOUNT_USDC = "10";
const DEFAULT_PER_ASK_CAP_ATOMIC = 2_000_000n;
const DEFAULT_DAILY_CAP_ATOMIC = 10_000_000n;
const DEFAULT_AGENT_SCOPES = ["curyo:ask", "curyo:read", "curyo:quote", "curyo:balance"];

type AgentPolicyFormState = {
  agentId: string;
  agentWalletAddress: string;
  categories: string[];
  dailyCap: string;
  perAskCap: string;
  policyId: string | null;
  scopes: string[];
};

const DEFAULT_POLICY_FORM: AgentPolicyFormState = {
  agentId: "research-agent",
  agentWalletAddress: "",
  categories: [],
  dailyCap: "10",
  perAskCap: "2",
  policyId: null,
  scopes: DEFAULT_AGENT_SCOPES,
};

function shortAddress(value: string | undefined) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

function formatUsdc(value: unknown) {
  return formatSubmissionRewardAmount(typeof value === "bigint" ? value : 0n, "usdc");
}

function formatUsdcInput(value: string | bigint | number | null | undefined) {
  const raw = BigInt(value ?? 0);
  const whole = raw / 1_000_000n;
  const fractional = raw % 1_000_000n;
  const fractionalText = fractional.toString().padStart(6, "0").replace(/0+$/, "");
  return fractionalText ? `${whole.toString()}.${fractionalText}` : whole.toString();
}

function policyToForm(policy: AgentPolicyRecord, fallbackWallet: string | undefined): AgentPolicyFormState {
  return {
    agentId: policy.agentId,
    agentWalletAddress: policy.agentWalletAddress || fallbackWallet || "",
    categories: policy.categories,
    dailyCap: formatUsdcInput(policy.dailyBudgetAtomic),
    perAskCap: formatUsdcInput(policy.perAskLimitAtomic),
    policyId: policy.id,
    scopes: policy.scopes.length > 0 ? policy.scopes : DEFAULT_AGENT_SCOPES,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function statusClassName(status: AgentPolicyRecord["status"]) {
  if (status === "active") return "border-success/30 text-success";
  if (status === "paused") return "border-warning/40 text-warning";
  return "border-error/40 text-error";
}

function shortOperationKey(value: AgentAskSummary["operationKey"]) {
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export function AgentSubmissionPanel() {
  const wagmiConfig = useConfig();
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard({ successDurationMs: 1500 });
  const { writeContractAsync } = useWriteContract();
  const [isApprovingEscrow, setIsApprovingEscrow] = useState(false);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState<AgentPolicyFormState>(DEFAULT_POLICY_FORM);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [generatedMcpConfig, setGeneratedMcpConfig] = useState<string | null>(null);
  const escrowAddress = getConfiguredQuestionRewardPoolEscrowAddress(targetNetwork.id);
  const usdcAddress = getDefaultUsdcAddress(targetNetwork.id);
  const thirdwebTargetChain = useMemo(() => defineChain(targetNetwork), [targetNetwork]);
  const { categories, isLoading: categoriesLoading } = useCategoryRegistry();
  const agentPolicies = useAgentPolicies(address, { autoRead: false });
  const selectedPolicy = useMemo(
    () => agentPolicies.policies.find(policy => policy.id === selectedPolicyId) ?? null,
    [agentPolicies.policies, selectedPolicyId],
  );
  const { data: recentAsks = [], isLoading: recentAsksLoading } = useAgentPolicyRecentAsks(
    address,
    selectedPolicy?.id,
    agentPolicies.hasReadSession,
  );

  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && usdcAddress) },
  });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && escrowAddress ? [address, escrowAddress] : undefined,
    query: { enabled: Boolean(address && escrowAddress && usdcAddress) },
  });

  const balance = typeof balanceRaw === "bigint" ? balanceRaw : 0n;
  const allowance = typeof allowanceRaw === "bigint" ? allowanceRaw : 0n;
  const hasUsdcForDefaultAsk = balance >= DEFAULT_PER_ASK_CAP_ATOMIC;
  const hasEscrowAllowanceForDefaultAsk = allowance >= DEFAULT_PER_ASK_CAP_ATOMIC;
  const ready = Boolean(
    address && escrowAddress && usdcAddress && hasUsdcForDefaultAsk && hasEscrowAllowanceForDefaultAsk,
  );
  const canUseThirdwebFunding = Boolean(
    thirdwebClient && address && usdcAddress && targetNetwork.id === CELO_MAINNET_CHAIN_ID,
  );
  const fundingUnavailableMessage = !thirdwebClient
    ? "Direct funding appears after thirdweb is configured for this deployment."
    : targetNetwork.id === CELO_MAINNET_CHAIN_ID
      ? "Celo USDC is not configured for this network."
      : "Switch to Celo mainnet to buy Celo USDC here. On local networks, use the faucet from your wallet menu.";

  const setupSteps = [
    {
      complete: Boolean(address),
      detail: address ? shortAddress(address) : "Connect a signer wallet",
      label: "Signer",
    },
    {
      complete: hasUsdcForDefaultAsk,
      detail: hasUsdcForDefaultAsk ? formatUsdc(balance) : `At least ${formatUsdc(DEFAULT_PER_ASK_CAP_ATOMIC)}`,
      label: "USDC",
    },
    {
      complete: hasEscrowAllowanceForDefaultAsk,
      detail: hasEscrowAllowanceForDefaultAsk
        ? formatUsdc(allowance)
        : `Approve ${formatUsdc(DEFAULT_PER_ASK_CAP_ATOMIC)} or more`,
      label: "Escrow",
    },
    {
      complete: Boolean(address),
      detail: "Use walletAddress in the MCP config",
      label: "Agent config",
    },
  ];

  useEffect(() => {
    setPolicyForm(prev => {
      if (!address || prev.agentWalletAddress) return prev;
      return { ...prev, agentWalletAddress: address };
    });
  }, [address]);

  useEffect(() => {
    if (selectedPolicyId || agentPolicies.policies.length === 0) return;
    const firstPolicy = agentPolicies.policies[0];
    setSelectedPolicyId(firstPolicy.id);
    setPolicyForm(policyToForm(firstPolicy, address));
  }, [address, agentPolicies.policies, selectedPolicyId]);

  const handleCopy = useCallback(
    async (value: string | undefined) => {
      if (!value) return;
      await copyToClipboard(value);
    },
    [copyToClipboard],
  );

  const handleApproveEscrow = useCallback(async () => {
    if (!address) {
      notification.error("Connect your wallet before approving escrow.");
      return;
    }
    if (!escrowAddress || !usdcAddress) {
      notification.error("Celo USDC or reward escrow is not configured for this network.");
      return;
    }

    setIsApprovingEscrow(true);
    try {
      const approveHash = await writeContractAsync({
        address: usdcAddress,
        abi: ERC20_APPROVAL_ABI,
        functionName: "approve",
        args: [escrowAddress, DEFAULT_DAILY_CAP_ATOMIC],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      await refetchAllowance();
      notification.success(`Escrow allowance set to ${formatUsdc(DEFAULT_DAILY_CAP_ATOMIC)}.`);
    } catch (error) {
      notification.error(
        (error as { shortMessage?: string; message?: string } | undefined)?.shortMessage ||
          (error as { shortMessage?: string; message?: string } | undefined)?.message ||
          "Failed to approve escrow",
      );
    } finally {
      setIsApprovingEscrow(false);
    }
  }, [address, escrowAddress, refetchAllowance, usdcAddress, wagmiConfig, writeContractAsync]);

  const handlePolicySelect = useCallback(
    (policyId: string) => {
      const policy = agentPolicies.policies.find(candidate => candidate.id === policyId);
      setSelectedPolicyId(policyId || null);
      setGeneratedToken(null);
      setGeneratedMcpConfig(null);
      if (policy) {
        setPolicyForm(policyToForm(policy, address));
      } else {
        setPolicyForm({ ...DEFAULT_POLICY_FORM, agentWalletAddress: address ?? "" });
      }
    },
    [address, agentPolicies.policies],
  );

  const handleToggleCategory = useCallback((categoryId: string) => {
    setPolicyForm(prev => {
      const selected = new Set(prev.categories);
      if (selected.has(categoryId)) {
        selected.delete(categoryId);
      } else {
        selected.add(categoryId);
      }
      return { ...prev, categories: Array.from(selected).sort((a, b) => Number(a) - Number(b)) };
    });
  }, []);

  const handleToggleScope = useCallback((scope: string) => {
    setPolicyForm(prev => {
      const selected = new Set(prev.scopes);
      if (selected.has(scope)) {
        selected.delete(scope);
      } else {
        selected.add(scope);
      }
      return { ...prev, scopes: Array.from(selected) };
    });
  }, []);

  const handleUnlockAgentPolicies = useCallback(async () => {
    const result = await agentPolicies.unlock();
    if (result.ok) {
      notification.success("Managed agent controls unlocked.");
      return;
    }
    if (result.reason === "rejected") {
      notification.warning("Signature rejected. Managed agents stay locked.");
      return;
    }
    notification.error(result.error || "Failed to unlock managed agents.");
  }, [agentPolicies]);

  const handleSavePolicy = useCallback(async () => {
    if (!address) {
      notification.error("Connect your wallet before saving an agent policy.");
      return;
    }

    const perAskLimit = parseSubmissionRewardAmount(policyForm.perAskCap);
    const dailyBudget = parseSubmissionRewardAmount(policyForm.dailyCap);
    if (!perAskLimit || !dailyBudget) {
      notification.warning("Enter positive USDC amounts with up to 6 decimals.");
      return;
    }
    if (dailyBudget < perAskLimit) {
      notification.warning("Daily cap must be at least the per-submission cap.");
      return;
    }
    if (policyForm.scopes.length === 0) {
      notification.warning("Choose at least one MCP scope.");
      return;
    }

    const result = await agentPolicies.savePolicy({
      agentId: policyForm.agentId,
      agentWalletAddress: policyForm.agentWalletAddress || address,
      categories: policyForm.categories,
      dailyBudgetAtomic: dailyBudget.toString(),
      perAskLimitAtomic: perAskLimit.toString(),
      policyId: policyForm.policyId,
      scopes: policyForm.scopes,
    });
    if (result.ok && result.policy) {
      setSelectedPolicyId(result.policy.id);
      setPolicyForm(policyToForm(result.policy, address));
      notification.success("Managed agent policy saved.");
      return;
    }
    if (result.reason === "rejected") {
      notification.warning("Signature rejected. Managed agent policy was not saved.");
      return;
    }
    notification.error(result.error || "Failed to save managed agent policy.");
  }, [address, agentPolicies, policyForm]);

  const handleRotateToken = useCallback(async () => {
    if (!selectedPolicy) {
      notification.warning("Save the managed agent before creating an MCP token.");
      return;
    }
    const result = await agentPolicies.rotateToken(selectedPolicy.id);
    if (result.ok && result.token) {
      setGeneratedToken(result.token);
      setGeneratedMcpConfig(JSON.stringify(result.mcpConfig, null, 2));
      notification.success(selectedPolicy.hasToken ? "MCP token rotated." : "MCP token created.");
      return;
    }
    if (result.reason === "rejected") {
      notification.warning("Signature rejected. MCP token was not changed.");
      return;
    }
    notification.error(result.error || "Failed to rotate MCP token.");
  }, [agentPolicies, selectedPolicy]);

  const handleRevokeToken = useCallback(async () => {
    if (!selectedPolicy) return;
    const result = await agentPolicies.revokeToken(selectedPolicy.id);
    if (result.ok) {
      setGeneratedToken(null);
      setGeneratedMcpConfig(null);
      notification.success("MCP token revoked.");
      return;
    }
    if (result.reason === "rejected") {
      notification.warning("Signature rejected. MCP token remains active.");
      return;
    }
    notification.error(result.error || "Failed to revoke MCP token.");
  }, [agentPolicies, selectedPolicy]);

  const handleUpdatePolicyStatus = useCallback(
    async (action: "pause" | "resume" | "revoke") => {
      if (!selectedPolicy) return;
      const result = await agentPolicies.updateStatus(selectedPolicy.id, action);
      if (result.ok && result.policy) {
        setSelectedPolicyId(result.policy.id);
        setPolicyForm(policyToForm(result.policy, address));
        if (action === "revoke") {
          setGeneratedToken(null);
          setGeneratedMcpConfig(null);
        }
        notification.success(
          action === "pause"
            ? "Managed agent paused."
            : action === "resume"
              ? "Managed agent resumed."
              : "Managed agent revoked.",
        );
        return;
      }
      if (result.reason === "rejected") {
        notification.warning("Signature rejected. Managed agent status was not changed.");
        return;
      }
      notification.error(result.error || "Failed to update managed agent status.");
    },
    [address, agentPolicies, selectedPolicy],
  );

  return (
    <section className="space-y-4">
      <div className="surface-card rounded-lg p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Agent Wallet</p>
            <h2 className="mt-1 text-2xl font-semibold">Smart wallet spend controls</h2>
          </div>
          <div
            className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
              ready ? "border-success/30 text-success" : "border-warning/40 text-warning"
            }`}
          >
            <WalletIcon className="h-4 w-4" />
            <span>{ready ? "Ready" : "Setup needed"}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-base-300 bg-base-100/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
              <WalletIcon className="h-4 w-4" />
              <span>Signer</span>
            </div>
            <p className="mt-2 font-mono text-sm">{shortAddress(address)}</p>
          </div>
          <div className="rounded-lg border border-base-300 bg-base-100/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
              <CpuChipIcon className="h-4 w-4" />
              <span>USDC</span>
            </div>
            <p className="mt-2 text-lg font-semibold">{formatUsdc(balance)}</p>
          </div>
          <div className="rounded-lg border border-base-300 bg-base-100/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
              <KeyIcon className="h-4 w-4" />
              <span>Escrow Allowance</span>
            </div>
            <p className="mt-2 text-lg font-semibold">{formatUsdc(allowance)}</p>
          </div>
        </div>

        <div className="mt-5 border-t border-base-300 pt-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold">Get started</h3>
              <p className="mt-1 text-sm leading-relaxed text-base-content/65">
                Fund the signer, approve escrow, then give your agent the MCP wallet address.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/docs/ai#get-started" className="btn btn-outline btn-sm">
                Docs
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Link>
              <Link href="/docs/ai#generic-mcp-config" className="btn btn-outline btn-sm">
                MCP setup
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {setupSteps.map(step => (
              <div key={step.label} className="rounded-lg border border-base-300 bg-base-100/50 p-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {step.complete ? (
                    <CheckCircleIcon className="h-4 w-4 text-success" />
                  ) : (
                    <ExclamationTriangleIcon className="h-4 w-4 text-warning" />
                  )}
                  <span>{step.label}</span>
                </div>
                <p className="mt-1 text-sm text-base-content/60">{step.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-card rounded-lg p-5">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Funding</p>
            <h3 className="mt-1 text-xl font-semibold">Add Celo USDC</h3>
            <p className="mt-2 text-sm leading-relaxed text-base-content/65">
              The agent wallet spends Celo USDC directly from this signer. The escrow approval limits what Curyo can
              pull for submitted questions.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleCopy(address)}
                disabled={!address}
                className="btn btn-outline btn-sm"
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                {isCopiedToClipboard ? "Copied" : "Copy wallet"}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy(usdcAddress)}
                disabled={!usdcAddress}
                className="btn btn-outline btn-sm"
              >
                <ClipboardDocumentIcon className="h-4 w-4" />
                Copy USDC
              </button>
              <button
                type="button"
                onClick={() => void handleApproveEscrow()}
                disabled={!address || !escrowAddress || !usdcAddress || isApprovingEscrow}
                className="btn btn-primary btn-sm"
              >
                <KeyIcon className="h-4 w-4" />
                {isApprovingEscrow ? "Approving..." : "Approve escrow"}
              </button>
            </div>
          </div>

          <div className="min-w-0">
            {canUseThirdwebFunding && thirdwebClient && address && usdcAddress ? (
              <BuyWidget
                amount={DEFAULT_FUNDING_AMOUNT_USDC}
                amountEditable
                buttonLabel="Add USDC"
                chain={thirdwebTargetChain}
                client={thirdwebClient}
                description="Fund this agent signer with Celo USDC."
                onSuccess={() => void refetchBalance()}
                presetOptions={[5, 10, 20]}
                receiverAddress={address as `0x${string}`}
                showThirdwebBranding={false}
                theme="dark"
                title="Add Celo USDC"
                tokenAddress={usdcAddress}
                tokenEditable={false}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-base-300 bg-base-100/50 p-4">
                <p className="text-sm leading-relaxed text-base-content/65">{fundingUnavailableMessage}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
        <div className="surface-card rounded-lg p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Managed Agent Policy</p>
              <h3 className="mt-1 text-xl font-semibold">Persistent submit controls</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {agentPolicies.policies.length > 0 ? (
                <select
                  aria-label="Managed agent policy"
                  className="select select-bordered select-sm min-w-48"
                  value={selectedPolicyId ?? ""}
                  onChange={event => handlePolicySelect(event.target.value)}
                >
                  {agentPolicies.policies.map(policy => (
                    <option key={policy.id} value={policy.id}>
                      {policy.agentId}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!address || agentPolicies.isLoading}
                onClick={() => void handleUnlockAgentPolicies()}
              >
                <KeyIcon className="h-4 w-4" />
                {agentPolicies.hasReadSession ? "Refresh" : "Unlock"}
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setSelectedPolicyId(null);
                  setGeneratedToken(null);
                  setGeneratedMcpConfig(null);
                  setPolicyForm({ ...DEFAULT_POLICY_FORM, agentWalletAddress: address ?? "" });
                }}
              >
                New
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="form-control">
              <span className="label-text text-sm font-medium">Agent id</span>
              <input
                className="input input-bordered mt-1"
                value={policyForm.agentId}
                onChange={event => setPolicyForm(prev => ({ ...prev, agentId: event.target.value }))}
                placeholder="research-agent"
              />
            </label>
            <label className="form-control">
              <span className="label-text text-sm font-medium">Agent wallet</span>
              <input
                className="input input-bordered mt-1 font-mono"
                value={policyForm.agentWalletAddress}
                onChange={event => setPolicyForm(prev => ({ ...prev, agentWalletAddress: event.target.value }))}
                placeholder="0x..."
              />
            </label>
            <label className="form-control">
              <span className="label-text text-sm font-medium">Per submission cap</span>
              <div className="join mt-1">
                <input
                  className="input input-bordered join-item w-full"
                  value={policyForm.perAskCap}
                  onChange={event => setPolicyForm(prev => ({ ...prev, perAskCap: event.target.value }))}
                  inputMode="decimal"
                />
                <span className="join-item inline-flex items-center border border-base-300 bg-base-200 px-3 text-sm text-base-content/70">
                  USDC
                </span>
              </div>
            </label>
            <label className="form-control">
              <span className="label-text text-sm font-medium">Daily cap</span>
              <div className="join mt-1">
                <input
                  className="input input-bordered join-item w-full"
                  value={policyForm.dailyCap}
                  onChange={event => setPolicyForm(prev => ({ ...prev, dailyCap: event.target.value }))}
                  inputMode="decimal"
                />
                <span className="join-item inline-flex items-center border border-base-300 bg-base-200 px-3 text-sm text-base-content/70">
                  USDC
                </span>
              </div>
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-base-300 bg-base-100/50 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h4 className="font-semibold">Allowed categories</h4>
                <p className="mt-1 text-sm text-base-content/60">
                  Empty means the token can submit asks to any active category.
                </p>
              </div>
              <button
                type="button"
                className={`btn btn-sm ${policyForm.categories.length === 0 ? "btn-primary" : "btn-outline"}`}
                onClick={() => setPolicyForm(prev => ({ ...prev, categories: [] }))}
              >
                All categories
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {categoriesLoading && categories.length === 0 ? (
                <span className="loading loading-spinner loading-sm" />
              ) : categories.length > 0 ? (
                categories.map(category => {
                  const categoryId = category.id.toString();
                  const selected = policyForm.categories.includes(categoryId);
                  return (
                    <button
                      key={categoryId}
                      type="button"
                      className={`btn btn-sm ${selected ? "btn-primary" : "btn-outline"}`}
                      onClick={() => handleToggleCategory(categoryId)}
                    >
                      {category.name}
                    </button>
                  );
                })
              ) : (
                <input
                  className="input input-bordered w-full"
                  value={policyForm.categories.join(",")}
                  onChange={event =>
                    setPolicyForm(prev => ({
                      ...prev,
                      categories: event.target.value
                        .split(",")
                        .map(value => value.trim())
                        .filter(Boolean),
                    }))
                  }
                  placeholder="Category ids, comma separated"
                />
              )}
            </div>
          </div>

          <div className="mt-5 rounded-lg border border-base-300 bg-base-100/50 p-4">
            <h4 className="font-semibold">MCP scopes</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DEFAULT_AGENT_SCOPES.map(scope => (
                <label
                  key={scope}
                  className="flex items-center gap-2 rounded-lg border border-base-300 px-3 py-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-primary checkbox-sm"
                    checked={policyForm.scopes.includes(scope)}
                    onChange={() => handleToggleScope(scope)}
                  />
                  <span className="font-mono">{scope}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={!address || agentPolicies.isSaving}
              onClick={() => void handleSavePolicy()}
            >
              <KeyIcon className="h-4 w-4" />
              {agentPolicies.isSaving ? "Saving..." : "Save policy"}
            </button>
            {selectedPolicy ? (
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-sm ${statusClassName(selectedPolicy.status)}`}
              >
                {selectedPolicy.status}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="surface-card rounded-lg p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Token Lifecycle</p>
                <h3 className="mt-1 text-lg font-semibold">MCP access</h3>
              </div>
              <Link href="/docs/ai#mcp-adapter-shape" className="link link-primary text-sm">
                Docs
              </Link>
            </div>

            {selectedPolicy ? (
              <>
                <dl className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-base-content/60">Token</dt>
                    <dd>{selectedPolicy.hasToken ? "Active" : "Not created"}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-base-content/60">Issued</dt>
                    <dd>{formatDateTime(selectedPolicy.tokenIssuedAt)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-base-content/60">Escrow</dt>
                    <dd className="font-mono">{shortAddress(escrowAddress)}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={agentPolicies.isTokenBusy || selectedPolicy.status === "revoked"}
                    onClick={() => void handleRotateToken()}
                  >
                    <KeyIcon className="h-4 w-4" />
                    {selectedPolicy.hasToken ? "Rotate token" : "Create token"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={agentPolicies.isTokenBusy || !selectedPolicy.hasToken}
                    onClick={() => void handleRevokeToken()}
                  >
                    Revoke token
                  </button>
                </div>

                {generatedToken ? (
                  <div className="mt-4 rounded-lg border border-success/30 bg-success/10 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-success">New token</span>
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => void handleCopy(generatedToken)}
                      >
                        Copy
                      </button>
                    </div>
                    <p className="mt-2 break-all font-mono text-xs">{generatedToken}</p>
                  </div>
                ) : null}

                {generatedMcpConfig ? (
                  <div className="mt-3 rounded-lg border border-base-300 bg-base-100/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">MCP config</span>
                      <button
                        type="button"
                        className="btn btn-outline btn-xs"
                        onClick={() => void handleCopy(generatedMcpConfig)}
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded bg-black p-3 text-xs text-white">
                      {generatedMcpConfig}
                    </pre>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-4 text-sm leading-relaxed text-base-content/65">
                Save or unlock a managed agent policy to create a token.
              </p>
            )}
          </div>

          <div className="surface-card rounded-lg p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Pause / Revoke</p>
            <h3 className="mt-1 text-lg font-semibold">Kill switch</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!selectedPolicy || agentPolicies.isStatusBusy || selectedPolicy.status !== "active"}
                onClick={() => void handleUpdatePolicyStatus("pause")}
              >
                <PauseCircleIcon className="h-4 w-4" />
                Pause
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!selectedPolicy || agentPolicies.isStatusBusy || selectedPolicy.status !== "paused"}
                onClick={() => void handleUpdatePolicyStatus("resume")}
              >
                <PlayCircleIcon className="h-4 w-4" />
                Resume
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm text-error"
                disabled={!selectedPolicy || agentPolicies.isStatusBusy || selectedPolicy.status === "revoked"}
                onClick={() => void handleUpdatePolicyStatus("revoke")}
              >
                <NoSymbolIcon className="h-4 w-4" />
                Revoke agent
              </button>
            </div>
          </div>

          <div className="surface-card rounded-lg p-5">
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Recent Agent Asks</p>
            <h3 className="mt-1 text-lg font-semibold">Audit trail</h3>
            <div className="mt-4 space-y-3">
              {!agentPolicies.hasReadSession ? (
                <p className="text-sm text-base-content/60">Unlock managed agents to view recent ask operations.</p>
              ) : recentAsksLoading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : recentAsks.length > 0 ? (
                recentAsks.map(ask => (
                  <div key={ask.operationKey} className="rounded-lg border border-base-300 bg-base-100/50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs">{shortOperationKey(ask.operationKey)}</span>
                      <span className="rounded-full border border-base-300 px-2 py-0.5 text-xs">{ask.status}</span>
                    </div>
                    <div className="mt-2 grid gap-1 text-base-content/65">
                      <span>{formatSubmissionRewardAmount(ask.paymentAmount, "usdc")}</span>
                      <span>Category {ask.categoryId}</span>
                      {ask.contentId ? <span>Content {ask.contentId}</span> : null}
                      {ask.error ? <span className="text-error">{ask.error}</span> : null}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-base-content/60">No asks recorded for this managed agent yet.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
