"use client";

import { useMemo, useState } from "react";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { XMarkIcon } from "@heroicons/react/24/outline";
import {
  DEFAULT_REWARD_POOL_FRONTEND_FEE_BPS,
  ERC20_APPROVAL_ABI,
  MIN_REWARD_POOL_REQUIRED_VOTERS,
  MIN_REWARD_POOL_SETTLED_ROUNDS,
  QUESTION_REWARD_POOL_ESCROW_ABI,
  formatUsdAmount,
  getConfiguredQuestionRewardPoolEscrowAddress,
  getDefaultUsdcAddress,
  parseUsdRewardPoolAmount,
} from "~~/lib/questionRewardPools";
import { notification } from "~~/utils/scaffold-eth";

type FundQuestionModalProps = {
  contentId: bigint;
  title: string;
  onClose: () => void;
  onCreated?: () => void;
};

function getExpiryTimestamp(days: number): bigint {
  if (!Number.isFinite(days) || days <= 0) return 0n;
  return BigInt(Math.floor(Date.now() / 1000) + Math.floor(days * 24 * 60 * 60));
}

const FRONTEND_FEE_PERCENT = DEFAULT_REWARD_POOL_FRONTEND_FEE_BPS / 100;

export function FundQuestionModal({ contentId, title, onClose, onCreated }: FundQuestionModalProps) {
  const wagmiConfig = useConfig();
  const { address, chain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [amount, setAmount] = useState("10");
  const [requiredVoters, setRequiredVoters] = useState("5");
  const [requiredRounds, setRequiredRounds] = useState("2");
  const [expiryDays, setExpiryDays] = useState("30");
  const [isFunding, setIsFunding] = useState(false);

  const chainId = chain?.id ?? wagmiConfig.chains[0]?.id ?? 0;
  const escrowAddress = useMemo(() => getConfiguredQuestionRewardPoolEscrowAddress(chainId), [chainId]);
  const fallbackUsdcAddress = useMemo(() => getDefaultUsdcAddress(chainId), [chainId]);
  const parsedAmount = useMemo(() => parseUsdRewardPoolAmount(amount), [amount]);
  const voterCount = Math.max(MIN_REWARD_POOL_REQUIRED_VOTERS, Math.floor(Number(requiredVoters) || 0));
  const settledRounds = Math.max(MIN_REWARD_POOL_SETTLED_ROUNDS, Math.floor(Number(requiredRounds) || 0));
  const expiry = Math.max(0, Math.floor(Number(expiryDays) || 0));
  const canSubmit = Boolean(
    address &&
      escrowAddress &&
      parsedAmount &&
      voterCount >= MIN_REWARD_POOL_REQUIRED_VOTERS &&
      settledRounds >= MIN_REWARD_POOL_SETTLED_ROUNDS,
  );

  const handleFundQuestion = async () => {
    if (!address) {
      notification.error("Connect your wallet to fund this question.");
      return;
    }
    if (!escrowAddress) {
      notification.error("Question Reward Pools are not deployed on this network yet.");
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
          abi: QUESTION_REWARD_POOL_ESCROW_ABI,
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

      const rewardPoolHash = await writeContractAsync({
        address: escrowAddress,
        abi: QUESTION_REWARD_POOL_ESCROW_ABI,
        functionName: "createRewardPool",
        args: [contentId, parsedAmount, BigInt(voterCount), BigInt(settledRounds), getExpiryTimestamp(expiry)],
      });
      await waitForTransactionReceipt(wagmiConfig, { hash: rewardPoolHash });

      notification.success(`Question Reward Pool funded with ${formatUsdAmount(parsedAmount)}. Paid in USDC on Celo.`);
      onCreated?.();
      onClose();
    } catch (error) {
      notification.error(
        (error as { shortMessage?: string; message?: string } | undefined)?.shortMessage ||
          (error as { shortMessage?: string; message?: string } | undefined)?.message ||
          "Failed to fund this question",
      );
    } finally {
      setIsFunding(false);
    }
  };

  return (
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label="Fund this question">
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
          Paid in USDC on Celo. Qualified claims reserve {FRONTEND_FEE_PERCENT}% for the eligible frontend operator; the
          rest goes to eligible revealed voters.
        </p>

        <div className="mt-5 grid gap-4">
          <label className="form-control">
            <span className="label-text">Reward amount</span>
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
                min={MIN_REWARD_POOL_REQUIRED_VOTERS}
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
                min={MIN_REWARD_POOL_SETTLED_ROUNDS}
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
              Question Reward Pool funding is not available on this network yet.
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            type="button"
            onClick={handleFundQuestion}
            disabled={!canSubmit || isFunding}
            className="btn btn-primary"
          >
            {isFunding ? "Funding..." : "Fund this question"}
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
