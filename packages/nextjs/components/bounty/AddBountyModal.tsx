"use client";

import { useMemo, useState } from "react";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  ERC20_APPROVAL_ABI,
  MIN_BOUNTY_REQUIRED_VOTERS,
  MIN_BOUNTY_SETTLED_ROUNDS,
  QUESTION_BOUNTY_ESCROW_ABI,
  formatUsdAmount,
  getConfiguredQuestionBountyEscrowAddress,
  getDefaultUsdcAddress,
  parseUsdBountyAmount,
} from "~~/lib/questionBounties";
import { notification } from "~~/utils/scaffold-eth";

type AddBountyModalProps = {
  contentId: bigint;
  title: string;
  onClose: () => void;
  onCreated?: () => void;
};

function getExpiryTimestamp(days: number): bigint {
  if (!Number.isFinite(days) || days <= 0) return 0n;
  return BigInt(Math.floor(Date.now() / 1000) + Math.floor(days * 24 * 60 * 60));
}

export function AddBountyModal({ contentId, title, onClose, onCreated }: AddBountyModalProps) {
  const wagmiConfig = useConfig();
  const { address, chain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("10");
  const [requiredVoters, setRequiredVoters] = useState("5");
  const [requiredRounds, setRequiredRounds] = useState("2");
  const [expiryDays, setExpiryDays] = useState("30");
  const [isFunding, setIsFunding] = useState(false);

  const chainId = chain?.id ?? wagmiConfig.chains[0]?.id ?? 0;
  const escrowAddress = useMemo(() => getConfiguredQuestionBountyEscrowAddress(chainId), [chainId]);
  const fallbackUsdcAddress = useMemo(() => getDefaultUsdcAddress(chainId), [chainId]);
  const parsedAmount = useMemo(() => parseUsdBountyAmount(amount), [amount]);
  const voterCount = Math.max(MIN_BOUNTY_REQUIRED_VOTERS, Math.floor(Number(requiredVoters) || 0));
  const settledRounds = Math.max(MIN_BOUNTY_SETTLED_ROUNDS, Math.floor(Number(requiredRounds) || 0));
  const expiry = Math.max(0, Math.floor(Number(expiryDays) || 0));
  const canSubmit = Boolean(
    address &&
      escrowAddress &&
      parsedAmount &&
      voterCount >= MIN_BOUNTY_REQUIRED_VOTERS &&
      settledRounds >= MIN_BOUNTY_SETTLED_ROUNDS,
  );

  const handleCreateBounty = async () => {
    if (!address) {
      notification.error("Connect your wallet to fund a bounty.");
      return;
    }
    if (!escrowAddress) {
      notification.error("Question bounties are not deployed on this network yet.");
      return;
    }
    if (!parsedAmount) {
      notification.warning("Enter a positive USD amount.");
      return;
    }

    setIsFunding(true);
    try {
      let usdcAddress = fallbackUsdcAddress;
      try {
        usdcAddress = (await readContract(wagmiConfig, {
          address: escrowAddress,
          abi: QUESTION_BOUNTY_ESCROW_ABI,
          functionName: "usdcToken",
        })) as `0x${string}`;
      } catch {
        // Deployment metadata can be ahead of the escrow read during local work; fall back to chain defaults.
      }

      if (!usdcAddress) {
        notification.error("Celo USDC is not configured for this network.");
        return;
      }

      const allowance = (await readContract(wagmiConfig, {
        address: usdcAddress,
        abi: ERC20_APPROVAL_ABI,
        functionName: "allowance",
        args: [address, escrowAddress],
      })) as bigint;

      if (allowance < parsedAmount) {
        const approveHash = await writeContractAsync({
          address: usdcAddress,
          abi: ERC20_APPROVAL_ABI,
          functionName: "approve",
          args: [escrowAddress, parsedAmount],
        });
        await waitForTransactionReceipt(wagmiConfig, { hash: approveHash });
      }

      const bountyHash = await writeContractAsync({
        address: escrowAddress,
        abi: QUESTION_BOUNTY_ESCROW_ABI,
        functionName: "createBounty",
        args: [contentId, parsedAmount, BigInt(voterCount), BigInt(settledRounds), getExpiryTimestamp(expiry)],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: bountyHash });

      notification.success(`Bounty funded with ${formatUsdAmount(parsedAmount)} USDC.`);
      onCreated?.();
      onClose();
    } catch (error) {
      notification.error(
        (error as { shortMessage?: string; message?: string } | undefined)?.shortMessage ||
          (error as { shortMessage?: string; message?: string } | undefined)?.message ||
          "Failed to create bounty",
      );
    } finally {
      setIsFunding(false);
    }
  };

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label="Add bounty">
      <div className="modal-box w-[calc(100vw-2rem)] max-w-lg overflow-x-hidden bg-base-200 px-5 py-6 shadow-2xl sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <p className="text-sm font-semibold uppercase text-base-content/50">Fund this question</p>
        <h3 className="mt-1 line-clamp-2 text-xl font-semibold text-base-content">{title}</h3>
        <p className="mt-2 text-base text-base-content/70">
          Rewards are paid equally to eligible revealed voters for each qualifying settled round.
        </p>

        <div className="mt-5 grid gap-4">
          <label className="form-control">
            <span className="label-text">Bounty size</span>
            <div className="input input-bordered flex items-center gap-2 bg-base-100">
              <span className="text-base-content/50">$</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                className="grow"
                placeholder="10"
              />
              <span className="text-base-content/50">USDC</span>
            </div>
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="form-control">
              <span className="label-text">Required voters</span>
              <input
                type="number"
                min={MIN_BOUNTY_REQUIRED_VOTERS}
                step={1}
                value={requiredVoters}
                onChange={event => setRequiredVoters(event.target.value)}
                className="input input-bordered bg-base-100"
              />
            </label>
            <label className="form-control">
              <span className="label-text">Settled rounds</span>
              <input
                type="number"
                min={MIN_BOUNTY_SETTLED_ROUNDS}
                step={1}
                value={requiredRounds}
                onChange={event => setRequiredRounds(event.target.value)}
                className="input input-bordered bg-base-100"
              />
            </label>
          </div>

          <label className="form-control">
            <span className="label-text">Refund if not filled after</span>
            <input
              type="number"
              min={0}
              step={1}
              value={expiryDays}
              onChange={event => setExpiryDays(event.target.value)}
              className="input input-bordered bg-base-100"
            />
            <span className="label-text-alt text-base-content/50">Days. Use 0 for no expiry.</span>
          </label>

          {!escrowAddress ? (
            <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
              Bounty funding is not available on this network yet.
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleCreateBounty}
            disabled={!canSubmit || isFunding}
            className="btn btn-primary"
          >
            {isFunding ? "Funding..." : "Fund bounty"}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            Cancel
          </button>
        </div>
      </div>
      <div className="modal-backdrop bg-black/60 backdrop-blur-sm" aria-hidden="true" />
    </div>
  );
}
