"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { defineChain } from "thirdweb";
import { BuyWidget } from "thirdweb/react";
import { erc20Abi, isAddress } from "viem";
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
const SETUP_STEP_ORDER = ["wallet", "fund", "payment", "policy", "mcp"] as const;

type AgentSetupStep = (typeof SETUP_STEP_ORDER)[number];
type PaymentMode = "wallet_calls" | "x402_authorization";

const PAYMENT_MODE_OPTIONS: Array<{
  description: string;
  id: PaymentMode;
  label: string;
  note: string;
}> = [
  {
    description: "The MCP ask returns ordered approval and submission calls for the scoped wallet to execute.",
    id: "wallet_calls",
    label: "Wallet calls",
    note: "Best for agents that can operate an EVM wallet directly.",
  },
  {
    description: "The client prepares a native x402-style USDC authorization that funds protocol escrow directly.",
    id: "x402_authorization",
    label: "Native X402 authorization",
    note: "Best for clients or facilitators that already speak x402 payment authorization.",
  },
];

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

function toAddress(value: string | undefined): `0x${string}` | undefined {
  const trimmed = value?.trim();
  return trimmed && isAddress(trimmed, { strict: false }) ? (trimmed as `0x${string}`) : undefined;
}

function addressesMatch(first: string | undefined, second: string | undefined) {
  return Boolean(first && second && first.toLowerCase() === second.toLowerCase());
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
  const [isTransferringUsdc, setIsTransferringUsdc] = useState(false);
  const [transferAmount, setTransferAmount] = useState("5");
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null);
  const [policyForm, setPolicyForm] = useState<AgentPolicyFormState>(DEFAULT_POLICY_FORM);
  const [activeSetupStep, setActiveSetupStep] = useState<AgentSetupStep>("wallet");
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("wallet_calls");
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
  const connectedWalletAddress = toAddress(address);
  const explicitAgentWalletAddress = toAddress(policyForm.agentWalletAddress);
  const agentWalletAddress =
    explicitAgentWalletAddress ?? (policyForm.agentWalletAddress.trim() ? undefined : connectedWalletAddress);
  const agentWalletInputInvalid = policyForm.agentWalletAddress.trim().length > 0 && !explicitAgentWalletAddress;
  const agentWalletMatchesConnectedWallet = addressesMatch(agentWalletAddress, address);
  const requiresEscrowAllowance = paymentMode === "wallet_calls";

  const { data: balanceRaw, refetch: refetchBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: agentWalletAddress ? [agentWalletAddress] : undefined,
    query: { enabled: Boolean(agentWalletAddress && usdcAddress) },
  });
  const { data: allowanceRaw, refetch: refetchAllowance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: agentWalletAddress && escrowAddress ? [agentWalletAddress, escrowAddress] : undefined,
    query: { enabled: Boolean(agentWalletAddress && escrowAddress && usdcAddress) },
  });

  const balance = typeof balanceRaw === "bigint" ? balanceRaw : 0n;
  const allowance = typeof allowanceRaw === "bigint" ? allowanceRaw : 0n;
  const hasUsdcForDefaultAsk = balance >= DEFAULT_PER_ASK_CAP_ATOMIC;
  const hasEscrowAllowanceForDefaultAsk = allowance >= DEFAULT_PER_ASK_CAP_ATOMIC;
  const fundingReady = hasUsdcForDefaultAsk && (!requiresEscrowAllowance || hasEscrowAllowanceForDefaultAsk);
  const ready = Boolean(
    address && agentWalletAddress && escrowAddress && usdcAddress && fundingReady && selectedPolicy,
  );
  const canUseThirdwebFunding = Boolean(
    thirdwebClient && agentWalletAddress && usdcAddress && targetNetwork.id === CELO_MAINNET_CHAIN_ID,
  );
  const fundingUnavailableMessage = !agentWalletAddress
    ? "Enter a valid agent wallet before funding it here."
    : !thirdwebClient
      ? "Direct funding appears after thirdweb is configured for this deployment."
      : targetNetwork.id === CELO_MAINNET_CHAIN_ID
        ? "Celo USDC is not configured for this network."
        : "Switch to Celo mainnet to buy Celo USDC here. On local networks, use the faucet from your wallet menu.";
  const dashboardMode = Boolean(selectedPolicy && !isSetupMode);
  const setupSteps: Array<{ complete: boolean; id: AgentSetupStep; label: string }> = [
    {
      complete: Boolean(address && agentWalletAddress && !agentWalletInputInvalid),
      id: "wallet",
      label: "Agent wallet",
    },
    {
      complete: Boolean(agentWalletAddress && fundingReady),
      id: "fund",
      label: "Fund wallet",
    },
    {
      complete: true,
      id: "payment",
      label: "Payment mode",
    },
    {
      complete: Boolean(selectedPolicy),
      id: "policy",
      label: "Policy",
    },
    {
      complete: Boolean(selectedPolicy?.hasToken || generatedToken),
      id: "mcp",
      label: "MCP access",
    },
  ];

  useEffect(() => {
    setPolicyForm(prev => {
      if (!address || prev.agentWalletAddress) return prev;
      return { ...prev, agentWalletAddress: address };
    });
  }, [address]);

  useEffect(() => {
    if (selectedPolicyId || isSetupMode || agentPolicies.policies.length === 0) return;
    const firstPolicy = agentPolicies.policies[0];
    setSelectedPolicyId(firstPolicy.id);
    setPolicyForm(policyToForm(firstPolicy, address));
  }, [address, agentPolicies.policies, isSetupMode, selectedPolicyId]);

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
    if (!agentWalletAddress) {
      notification.error("Enter a valid agent wallet before approving escrow.");
      return;
    }
    if (!agentWalletMatchesConnectedWallet) {
      notification.warning("Connect the agent wallet before approving escrow for wallet-call payments.");
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
  }, [
    address,
    agentWalletAddress,
    agentWalletMatchesConnectedWallet,
    escrowAddress,
    refetchAllowance,
    usdcAddress,
    wagmiConfig,
    writeContractAsync,
  ]);

  const handleTransferUsdc = useCallback(async () => {
    if (!address) {
      notification.error("Connect the wallet that will fund the agent.");
      return;
    }
    if (!agentWalletAddress) {
      notification.error("Enter a valid agent wallet before transferring USDC.");
      return;
    }
    if (agentWalletMatchesConnectedWallet) {
      notification.info("The connected wallet is already the agent wallet.");
      return;
    }
    if (!usdcAddress) {
      notification.error("Celo USDC is not configured for this network.");
      return;
    }
    const amount = parseSubmissionRewardAmount(transferAmount);
    if (!amount) {
      notification.warning("Enter a positive USDC amount with up to 6 decimals.");
      return;
    }

    setIsTransferringUsdc(true);
    try {
      const transferHash = await writeContractAsync({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "transfer",
        args: [agentWalletAddress, amount],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: transferHash });
      await refetchBalance();
      notification.success(`Transferred ${formatUsdc(amount)} to the agent wallet.`);
    } catch (error) {
      notification.error(
        (error as { shortMessage?: string; message?: string } | undefined)?.shortMessage ||
          (error as { shortMessage?: string; message?: string } | undefined)?.message ||
          "Failed to transfer USDC",
      );
    } finally {
      setIsTransferringUsdc(false);
    }
  }, [
    address,
    agentWalletAddress,
    agentWalletMatchesConnectedWallet,
    refetchBalance,
    transferAmount,
    usdcAddress,
    wagmiConfig,
    writeContractAsync,
  ]);

  const handlePolicySelect = useCallback(
    (policyId: string) => {
      const policy = agentPolicies.policies.find(candidate => candidate.id === policyId);
      setSelectedPolicyId(policyId || null);
      setGeneratedToken(null);
      setGeneratedMcpConfig(null);
      setIsSetupMode(false);
      if (policy) {
        setPolicyForm(policyToForm(policy, address));
      } else {
        setIsSetupMode(true);
        setActiveSetupStep("wallet");
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

    const savedAgentWalletAddress = policyForm.agentWalletAddress.trim() || address;
    if (!toAddress(savedAgentWalletAddress)) {
      notification.warning("Enter a valid agent wallet address.");
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
      agentWalletAddress: savedAgentWalletAddress,
      categories: policyForm.categories,
      dailyBudgetAtomic: dailyBudget.toString(),
      perAskLimitAtomic: perAskLimit.toString(),
      policyId: policyForm.policyId,
      scopes: policyForm.scopes,
    });
    if (result.ok && result.policy) {
      setSelectedPolicyId(result.policy.id);
      setPolicyForm(policyToForm(result.policy, address));
      setActiveSetupStep("mcp");
      setIsSetupMode(true);
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

  const activeStepIndex = SETUP_STEP_ORDER.indexOf(activeSetupStep);
  const activeStepNumber = activeStepIndex + 1;

  const handleStartNewPolicy = () => {
    setSelectedPolicyId(null);
    setGeneratedToken(null);
    setGeneratedMcpConfig(null);
    setPolicyForm({ ...DEFAULT_POLICY_FORM, agentWalletAddress: address ?? "" });
    setActiveSetupStep("wallet");
    setIsSetupMode(true);
  };

  const handleEditSelectedPolicy = () => {
    if (selectedPolicy) {
      setPolicyForm(policyToForm(selectedPolicy, address));
    }
    setGeneratedToken(null);
    setGeneratedMcpConfig(null);
    setActiveSetupStep("wallet");
    setIsSetupMode(true);
  };

  const policySelector =
    agentPolicies.policies.length > 0 ? (
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
    ) : null;

  const tokenAccessPanel = selectedPolicy ? (
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
            <button type="button" className="btn btn-outline btn-xs" onClick={() => void handleCopy(generatedToken)}>
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
  );

  const recentAsksPanel = (
    <div className="space-y-3">
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
  );

  const categoryControls =
    categoriesLoading && categories.length === 0 ? (
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
    );

  if (dashboardMode && selectedPolicy) {
    return (
      <section className="space-y-4">
        <div className="surface-card rounded-lg p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Configured Agent</p>
              <h2 className="mt-1 text-2xl font-semibold">Managed submit dashboard</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {policySelector}
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={!address || agentPolicies.isLoading}
                onClick={() => void handleUnlockAgentPolicies()}
              >
                <KeyIcon className="h-4 w-4" />
                {agentPolicies.hasReadSession ? "Refresh" : "Unlock"}
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={handleEditSelectedPolicy}>
                Edit setup
              </button>
              <button type="button" className="btn btn-outline btn-sm" onClick={handleStartNewPolicy}>
                New
              </button>
              <span
                className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${
                  ready ? "border-success/30 text-success" : "border-warning/40 text-warning"
                }`}
              >
                <WalletIcon className="h-4 w-4" />
                {ready ? "Ready" : "Needs attention"}
              </span>
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-base-300 bg-base-100/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
                <CpuChipIcon className="h-4 w-4" />
                <span>Agent id</span>
              </div>
              <p className="mt-2 break-words text-lg font-semibold">{selectedPolicy.agentId}</p>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
                <WalletIcon className="h-4 w-4" />
                <span>Agent wallet</span>
              </div>
              <p className="mt-2 font-mono text-sm">{shortAddress(selectedPolicy.agentWalletAddress)}</p>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
                <KeyIcon className="h-4 w-4" />
                <span>Spend caps</span>
              </div>
              <p className="mt-2 text-sm text-base-content/75">
                {formatSubmissionRewardAmount(selectedPolicy.perAskLimitAtomic, "usdc")} per ask
              </p>
              <p className="mt-1 text-sm text-base-content/60">
                {formatSubmissionRewardAmount(selectedPolicy.dailyBudgetAtomic, "usdc")} daily
              </p>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100/70 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
                <CheckCircleIcon className="h-4 w-4" />
                <span>Status</span>
              </div>
              <span
                className={`mt-2 inline-flex rounded-full border px-3 py-1 text-sm ${statusClassName(selectedPolicy.status)}`}
              >
                {selectedPolicy.status}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
          <div className="space-y-4">
            <div className="surface-card rounded-lg p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Wallet Readiness</p>
                  <h3 className="mt-1 text-lg font-semibold">Funding and allowance</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={!agentWalletAddress}
                    onClick={() => void handleCopy(agentWalletAddress)}
                  >
                    <ClipboardDocumentIcon className="h-4 w-4" />
                    {isCopiedToClipboard ? "Copied" : "Copy wallet"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!address || !agentWalletMatchesConnectedWallet || !escrowAddress || !usdcAddress}
                    onClick={() => void handleApproveEscrow()}
                  >
                    <KeyIcon className="h-4 w-4" />
                    Approve escrow
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-base-300 bg-base-100/50 p-4">
                  <p className="text-sm text-base-content/60">Celo USDC</p>
                  <p className="mt-1 text-xl font-semibold">{formatUsdc(balance)}</p>
                </div>
                <div className="rounded-lg border border-base-300 bg-base-100/50 p-4">
                  <p className="text-sm text-base-content/60">Escrow allowance</p>
                  <p className="mt-1 text-xl font-semibold">{formatUsdc(allowance)}</p>
                </div>
              </div>
              {!agentWalletMatchesConnectedWallet ? (
                <p className="mt-3 text-sm text-base-content/60">
                  Escrow approval must be sent from the configured agent wallet.
                </p>
              ) : null}
            </div>

            <div className="surface-card rounded-lg p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Recent Agent Asks</p>
              <h3 className="mt-1 text-lg font-semibold">Audit trail</h3>
              <div className="mt-4">{recentAsksPanel}</div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="surface-card rounded-lg p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">MCP Access</p>
                  <h3 className="mt-1 text-lg font-semibold">Token lifecycle</h3>
                </div>
                <Link href="/docs/ai#mcp-adapter-shape" className="link link-primary text-sm">
                  Docs
                </Link>
              </div>
              {tokenAccessPanel}
            </div>

            <div className="surface-card rounded-lg p-5">
              <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Pause / Revoke</p>
              <h3 className="mt-1 text-lg font-semibold">Kill switch</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={agentPolicies.isStatusBusy || selectedPolicy.status !== "active"}
                  onClick={() => void handleUpdatePolicyStatus("pause")}
                >
                  <PauseCircleIcon className="h-4 w-4" />
                  Pause
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={agentPolicies.isStatusBusy || selectedPolicy.status !== "paused"}
                  onClick={() => void handleUpdatePolicyStatus("resume")}
                >
                  <PlayCircleIcon className="h-4 w-4" />
                  Resume
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm text-error"
                  disabled={agentPolicies.isStatusBusy || selectedPolicy.status === "revoked"}
                  onClick={() => void handleUpdatePolicyStatus("revoke")}
                >
                  <NoSymbolIcon className="h-4 w-4" />
                  Revoke agent
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="surface-card rounded-lg p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Agent Setup</p>
            <h2 className="mt-1 text-2xl font-semibold">Smart wallet submit controls</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/docs/ai#get-started" className="btn btn-outline btn-sm">
              Docs
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </Link>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={!address || agentPolicies.isLoading}
              onClick={() => void handleUnlockAgentPolicies()}
            >
              <KeyIcon className="h-4 w-4" />
              {agentPolicies.hasReadSession ? "Refresh" : "Unlock"}
            </button>
            {selectedPolicy ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setIsSetupMode(false)}>
                Dashboard
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm font-medium text-base-content/55">
          {setupSteps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              aria-current={activeSetupStep === step.id ? "step" : undefined}
              onClick={() => setActiveSetupStep(step.id)}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/80 ${
                activeSetupStep === step.id
                  ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                  : "step-control-inactive"
              }`}
            >
              {step.complete ? (
                <CheckCircleIcon className="h-4 w-4 text-success" />
              ) : (
                <ExclamationTriangleIcon className="h-4 w-4 text-warning" />
              )}
              <span>
                {index + 1}. {step.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeSetupStep === "wallet" ? (
        <div className="surface-card rounded-lg p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">
              Step {activeStepNumber} of {SETUP_STEP_ORDER.length}
            </p>
            <h3 className="mt-1 text-xl font-semibold">Choose the agent wallet</h3>
            <p className="mt-2 text-sm leading-relaxed text-base-content/65">
              The owner wallet signs policy changes. The agent wallet is the address your MCP client uses as
              walletAddress when it submits paid asks.
            </p>
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
                className={`input input-bordered mt-1 font-mono ${agentWalletInputInvalid ? "input-error" : ""}`}
                value={policyForm.agentWalletAddress}
                onChange={event => setPolicyForm(prev => ({ ...prev, agentWalletAddress: event.target.value }))}
                placeholder="0x..."
              />
              {agentWalletInputInvalid ? (
                <span className="mt-1 text-sm text-error">Enter a valid EVM address.</span>
              ) : null}
            </label>
          </div>

          <div className="mt-5 rounded-lg border border-base-300 bg-base-100/50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
              <WalletIcon className="h-4 w-4" />
              <span>Connected owner</span>
            </div>
            <p className="mt-2 text-sm text-base-content/70">
              {address ? "Connected for policy signatures" : "Connect a wallet to save policies"}
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-base-300 bg-base-100/50 p-4">
              <h4 className="text-sm font-semibold">Programmatic wallet</h4>
              <p className="mt-2 text-sm leading-relaxed text-base-content/60">
                Generate a dedicated EVM key in your agent runtime or wallet service and paste only its public address
                here.
              </p>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100/50 p-4">
              <h4 className="text-sm font-semibold">Smart wallet</h4>
              <p className="mt-2 text-sm leading-relaxed text-base-content/60">
                Use an embedded or account-abstraction wallet when your agent signs through a managed wallet provider.
              </p>
            </div>
            <div className="rounded-lg border border-base-300 bg-base-100/50 p-4">
              <h4 className="text-sm font-semibold">Key custody</h4>
              <p className="mt-2 text-sm leading-relaxed text-base-content/60">
                Keep the private key in the agent vault or runtime. Curyo only stores the public wallet address and
                policy limits.
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!address || !agentWalletAddress || agentWalletInputInvalid}
              onClick={() => setActiveSetupStep("fund")}
            >
              Continue
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={handleStartNewPolicy}>
              Reset
            </button>
          </div>
        </div>
      ) : null}

      {activeSetupStep === "fund" ? (
        <div className="surface-card rounded-lg p-5">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">
                Step {activeStepNumber} of {SETUP_STEP_ORDER.length}
              </p>
              <h3 className="mt-1 text-xl font-semibold">Fund the wallet</h3>
              <p className="mt-2 text-sm leading-relaxed text-base-content/65">
                Add Celo USDC to the agent wallet. Wallet-call payments also need an escrow allowance from that same
                wallet.
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-base-300 bg-base-100/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
                    <CpuChipIcon className="h-4 w-4" />
                    <span>Celo USDC</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold">{formatUsdc(balance)}</p>
                </div>
                <div className="rounded-lg border border-base-300 bg-base-100/50 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-base-content/60">
                    <KeyIcon className="h-4 w-4" />
                    <span>Escrow allowance</span>
                  </div>
                  <p className="mt-2 text-lg font-semibold">{formatUsdc(allowance)}</p>
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-base-300 bg-base-100/50 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <label className="form-control w-full lg:max-w-xs">
                    <span className="label-text text-sm font-medium">Transfer from connected wallet</span>
                    <div className="join mt-1">
                      <input
                        className="input input-bordered join-item w-full"
                        value={transferAmount}
                        onChange={event => setTransferAmount(event.target.value)}
                        inputMode="decimal"
                      />
                      <span className="join-item inline-flex items-center border border-base-300 bg-base-200 px-3 text-sm text-base-content/70">
                        USDC
                      </span>
                    </div>
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleTransferUsdc()}
                    disabled={
                      !address ||
                      !agentWalletAddress ||
                      !usdcAddress ||
                      agentWalletMatchesConnectedWallet ||
                      isTransferringUsdc
                    }
                    className="btn btn-primary btn-sm"
                  >
                    <WalletIcon className="h-4 w-4" />
                    {isTransferringUsdc ? "Transferring..." : "Transfer USDC"}
                  </button>
                </div>
                {agentWalletMatchesConnectedWallet ? (
                  <p className="mt-3 text-sm text-base-content/60">
                    The connected wallet already matches the agent wallet.
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-base-content/60">
                    Sends USDC from the connected wallet to the configured agent wallet.
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopy(agentWalletAddress)}
                  disabled={!agentWalletAddress}
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
                  disabled={
                    !address ||
                    !agentWalletAddress ||
                    !agentWalletMatchesConnectedWallet ||
                    !escrowAddress ||
                    !usdcAddress ||
                    isApprovingEscrow
                  }
                  className="btn btn-primary btn-sm"
                >
                  <KeyIcon className="h-4 w-4" />
                  {isApprovingEscrow ? "Approving..." : "Approve escrow"}
                </button>
              </div>
              {!agentWalletMatchesConnectedWallet && agentWalletAddress ? (
                <p className="mt-3 text-sm text-base-content/60">
                  Approval is disabled until the connected wallet matches the agent wallet.
                </p>
              ) : null}
            </div>

            <div className="min-w-0">
              {canUseThirdwebFunding && thirdwebClient && agentWalletAddress && usdcAddress ? (
                <BuyWidget
                  amount={DEFAULT_FUNDING_AMOUNT_USDC}
                  amountEditable
                  buttonLabel="Add USDC"
                  chain={thirdwebTargetChain}
                  client={thirdwebClient}
                  description="Fund this agent wallet with Celo USDC."
                  onSuccess={() => void refetchBalance()}
                  presetOptions={[5, 10, 20]}
                  receiverAddress={agentWalletAddress}
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

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveSetupStep("wallet")}>
              Back
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveSetupStep("payment")}>
              Continue
            </button>
          </div>
        </div>
      ) : null}

      {activeSetupStep === "payment" ? (
        <div className="surface-card rounded-lg p-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">
              Step {activeStepNumber} of {SETUP_STEP_ORDER.length}
            </p>
            <h3 className="mt-1 text-xl font-semibold">Pick the payment mode</h3>
            <p className="mt-2 text-sm leading-relaxed text-base-content/65">
              Both modes fund protocol escrow directly. Choose the shape your agent client can execute today.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {PAYMENT_MODE_OPTIONS.map(option => {
              const selected = paymentMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-lg border p-4 text-left transition-colors ${
                    selected
                      ? "border-primary/40 bg-primary/10 text-base-content"
                      : "border-base-300 bg-base-100/50 hover:border-primary/30"
                  }`}
                  onClick={() => setPaymentMode(option.id)}
                >
                  <span className="flex items-center gap-2 text-base font-semibold">
                    <input type="radio" className="radio radio-primary radio-sm" checked={selected} readOnly />
                    {option.label}
                  </span>
                  <span className="mt-3 block text-sm leading-relaxed text-base-content/65">{option.description}</span>
                  <span className="mt-3 block text-sm text-base-content/55">{option.note}</span>
                </button>
              );
            })}
          </div>

          {paymentMode === "wallet_calls" ? (
            <p className="mt-4 text-sm leading-relaxed text-base-content/65">
              Wallet-call mode requires the agent wallet to keep enough USDC balance and escrow allowance for returned
              transaction plans.
            </p>
          ) : (
            <p className="mt-4 text-sm leading-relaxed text-base-content/65">
              Native X402 authorization is configured in the agent client; the managed policy still limits categories,
              scopes, and spend.
            </p>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveSetupStep("fund")}>
              Back
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveSetupStep("policy")}>
              Continue
            </button>
            <Link href="/docs/ai#x402-agent-payments" className="btn btn-outline btn-sm">
              Payment docs
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </Link>
          </div>
        </div>
      ) : null}

      {activeSetupStep === "policy" ? (
        <div className="surface-card rounded-lg p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">
                Step {activeStepNumber} of {SETUP_STEP_ORDER.length}
              </p>
              <h3 className="mt-1 text-xl font-semibold">Set policy limits</h3>
              <p className="mt-2 text-sm leading-relaxed text-base-content/65">
                These limits are signed by the connected owner wallet and enforced by the managed MCP policy.
              </p>
            </div>
            {selectedPolicy ? (
              <span
                className={`inline-flex w-fit rounded-full border px-3 py-1 text-sm ${statusClassName(selectedPolicy.status)}`}
              >
                {selectedPolicy.status}
              </span>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
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
            <div className="mt-3 flex flex-wrap gap-2">{categoryControls}</div>
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
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveSetupStep("payment")}>
              Back
            </button>
            <button
              className="btn btn-primary btn-sm"
              type="button"
              disabled={!address || agentPolicies.isSaving}
              onClick={() => void handleSavePolicy()}
            >
              <KeyIcon className="h-4 w-4" />
              {agentPolicies.isSaving ? "Saving..." : "Save policy"}
            </button>
          </div>
        </div>
      ) : null}

      {activeSetupStep === "mcp" ? (
        <div className="surface-card rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">
                Step {activeStepNumber} of {SETUP_STEP_ORDER.length}
              </p>
              <h3 className="mt-1 text-xl font-semibold">Create MCP access</h3>
              <p className="mt-2 text-sm leading-relaxed text-base-content/65">
                Create or rotate the bearer token your agent client uses for Curyo MCP tools.
              </p>
            </div>
            <Link href="/docs/ai#generic-mcp-config" className="link link-primary text-sm">
              MCP setup
            </Link>
          </div>

          {tokenAccessPanel}

          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setActiveSetupStep("policy")}>
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!selectedPolicy}
              onClick={() => setIsSetupMode(false)}
            >
              Open dashboard
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
