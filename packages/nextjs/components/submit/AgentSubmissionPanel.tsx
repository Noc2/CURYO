"use client";

import { useCallback, useMemo, useState } from "react";
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
  WalletIcon,
} from "@heroicons/react/24/outline";
import { useCopyToClipboard } from "~~/hooks/scaffold-eth";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import {
  ERC20_APPROVAL_ABI,
  formatSubmissionRewardAmount,
  getConfiguredQuestionRewardPoolEscrowAddress,
  getDefaultUsdcAddress,
} from "~~/lib/questionRewardPools";
import { thirdwebClient } from "~~/services/thirdweb/client";
import { notification } from "~~/utils/scaffold-eth";

const CELO_MAINNET_CHAIN_ID = 42220;
const DEFAULT_FUNDING_AMOUNT_USDC = "10";
const DEFAULT_PER_ASK_CAP_ATOMIC = 2_000_000n;
const DEFAULT_DAILY_CAP_ATOMIC = 10_000_000n;

function shortAddress(value: string | undefined) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

function formatUsdc(value: unknown) {
  return formatSubmissionRewardAmount(typeof value === "bigint" ? value : 0n, "usdc");
}

export function AgentSubmissionPanel() {
  const wagmiConfig = useConfig();
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const { copyToClipboard, isCopiedToClipboard } = useCopyToClipboard({ successDurationMs: 1500 });
  const { writeContractAsync } = useWriteContract();
  const [isApprovingEscrow, setIsApprovingEscrow] = useState(false);
  const escrowAddress = getConfiguredQuestionRewardPoolEscrowAddress(targetNetwork.id);
  const usdcAddress = getDefaultUsdcAddress(targetNetwork.id);
  const thirdwebTargetChain = useMemo(() => defineChain(targetNetwork), [targetNetwork]);

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
              <Link href="/settings?tab=agents" className="btn btn-outline btn-sm">
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

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="surface-card rounded-lg p-5">
          <h3 className="text-lg font-semibold">Spend Policy Draft</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="form-control">
              <span className="label-text text-sm font-medium">Agent name</span>
              <input className="input input-bordered mt-1" defaultValue="research-agent" />
            </label>
            <label className="form-control">
              <span className="label-text text-sm font-medium">Agent wallet</span>
              <input className="input input-bordered mt-1 font-mono" placeholder="0x..." />
            </label>
            <label className="form-control">
              <span className="label-text text-sm font-medium">Per ask cap</span>
              <input className="input input-bordered mt-1" defaultValue="2.00 USDC" />
            </label>
            <label className="form-control">
              <span className="label-text text-sm font-medium">Daily cap</span>
              <input className="input input-bordered mt-1" defaultValue="10.00 USDC" />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-primary btn-sm" type="button">
              <KeyIcon className="h-4 w-4" />
              Save Draft
            </button>
            <button className="btn btn-outline btn-sm" type="button">
              Revoke
            </button>
          </div>
        </div>

        <div className="surface-card rounded-lg p-5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold">Developer Details</h3>
            <Link href="/docs/ai#mcp-adapter-shape" className="link link-primary text-sm">
              Docs
            </Link>
          </div>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-base-content/60">Ask tool</dt>
              <dd className="font-mono">curyo_ask_humans</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-base-content/60">Signer field</dt>
              <dd className="font-mono">walletAddress</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-base-content/60">Confirm tool</dt>
              <dd className="font-mono">curyo_confirm_ask_transactions</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-base-content/60">Escrow</dt>
              <dd className="font-mono">{shortAddress(escrowAddress)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
