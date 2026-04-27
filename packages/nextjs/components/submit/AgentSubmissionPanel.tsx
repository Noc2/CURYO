"use client";

import { erc20Abi } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { CpuChipIcon, KeyIcon, WalletIcon } from "@heroicons/react/24/outline";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import {
  formatSubmissionRewardAmount,
  getConfiguredQuestionRewardPoolEscrowAddress,
  getDefaultUsdcAddress,
} from "~~/lib/questionRewardPools";

function shortAddress(value: string | undefined) {
  return value ? `${value.slice(0, 6)}...${value.slice(-4)}` : "Not connected";
}

function formatUsdc(value: unknown) {
  return formatSubmissionRewardAmount(typeof value === "bigint" ? value : 0n, "usdc");
}

export function AgentSubmissionPanel() {
  const { address } = useAccount();
  const { targetNetwork } = useTargetNetwork();
  const escrowAddress = getConfiguredQuestionRewardPoolEscrowAddress(targetNetwork.id);
  const usdcAddress = getDefaultUsdcAddress(targetNetwork.id);

  const { data: balanceRaw } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && usdcAddress) },
  });
  const { data: allowanceRaw } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && escrowAddress ? [address, escrowAddress] : undefined,
    query: { enabled: Boolean(address && escrowAddress && usdcAddress) },
  });

  const balance = typeof balanceRaw === "bigint" ? balanceRaw : 0n;
  const allowance = typeof allowanceRaw === "bigint" ? allowanceRaw : 0n;
  const ready = Boolean(address && escrowAddress && usdcAddress);

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
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <div className="surface-card rounded-lg p-5">
          <h3 className="text-lg font-semibold">Policy Draft</h3>
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
          <h3 className="text-lg font-semibold">Agent Request Shape</h3>
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
