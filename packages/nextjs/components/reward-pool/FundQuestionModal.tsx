"use client";

import { type ReactNode, useId, useMemo, useState } from "react";
import { useAccount, useConfig, useWriteContract } from "wagmi";
import { readContract, waitForTransactionReceipt } from "wagmi/actions";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
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
  if (!Number.isFinite(days) || days < 1) return 0n;
  return BigInt(Math.floor(Date.now() / 1000) + Math.floor(days * 24 * 60 * 60));
}

const FRONTEND_FEE_PERCENT = DEFAULT_REWARD_POOL_FRONTEND_FEE_BPS / 100;
const REQUIRED_VOTERS_TOOLTIP =
  "How many eligible revealed voters a round needs before that round can count toward this bounty. This cannot exceed the question's selected voter cap.";
const SETTLED_ROUNDS_TOOLTIP =
  "How many qualifying settled rounds must complete before the bounty is filled and funds can be paid out.";
const REFUND_AFTER_TOOLTIP =
  "Days before unclaimed funds can be refunded. If the bounty has not filled by then, remaining funds can be returned to you.";

function BountyFieldLabel({ htmlFor, children, tooltip }: { htmlFor: string; children: ReactNode; tooltip?: string }) {
  return (
    <div className="label justify-start gap-1 px-0 py-0 pb-1">
      <label htmlFor={htmlFor} className="label-text">
        {children}
      </label>
      {tooltip ? <InfoTooltip text={tooltip} position="top" /> : null}
    </div>
  );
}

export function FundQuestionModal({ contentId, title, onClose, onCreated }: FundQuestionModalProps) {
  const wagmiConfig = useConfig();
  const { address, chain } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const amountInputId = useId();
  const requiredVotersInputId = useId();
  const requiredRoundsInputId = useId();
  const expiryDaysInputId = useId();
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
  const expiry = Math.floor(Number(expiryDays) || 0);
  const canSubmit = Boolean(
    address &&
      escrowAddress &&
      parsedAmount &&
      voterCount >= MIN_REWARD_POOL_REQUIRED_VOTERS &&
      settledRounds >= MIN_REWARD_POOL_SETTLED_ROUNDS &&
      expiry >= 1,
  );

  const handleFundQuestion = async () => {
    if (!address) {
      notification.error("Connect your wallet to fund this question.");
      return;
    }
    if (!escrowAddress) {
      notification.error("Bounties are not deployed on this network yet.");
      return;
    }
    if (!parsedAmount) {
      notification.warning("Enter a positive USD amount.");
      return;
    }
    if (expiry < 1) {
      notification.warning("Choose at least 1 day before refund.");
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

      notification.success(`Bounty funded with ${formatUsdAmount(parsedAmount)}. Paid in USDC on Celo.`);
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
    <div className="modal modal-open" role="dialog" aria-modal="true" aria-label="Fund a bounty">
      <div className="modal-box w-[calc(100vw-2rem)] max-w-lg overflow-x-hidden bg-base-200 px-5 py-6 shadow-2xl sm:px-6">
        <button
          type="button"
          onClick={onClose}
          className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2"
          aria-label="Close"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <p className="text-sm font-semibold uppercase text-base-content/50">Fund a bounty for</p>
        <h3 className="mt-1 line-clamp-2 text-xl font-semibold text-base-content">{title}</h3>
        <p className="mt-2 text-base text-base-content/70">
          Paid in USDC on Celo. Qualified claims reserve {FRONTEND_FEE_PERCENT}% for the eligible frontend operator; the
          rest goes to eligible revealed voters.
        </p>

        <div className="mt-5 grid gap-4">
          <div className="form-control">
            <BountyFieldLabel htmlFor={amountInputId}>Bounty amount</BountyFieldLabel>
            <div className="input input-bordered flex items-center gap-2 bg-base-100">
              <span className="text-base-content/50">$</span>
              <input
                id={amountInputId}
                inputMode="decimal"
                value={amount}
                onChange={event => setAmount(event.target.value)}
                className="grow"
                placeholder="10"
              />
              <span className="text-base-content/50">USDC</span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-control">
              <BountyFieldLabel htmlFor={requiredVotersInputId} tooltip={REQUIRED_VOTERS_TOOLTIP}>
                Required voters
              </BountyFieldLabel>
              <input
                id={requiredVotersInputId}
                type="number"
                min={MIN_REWARD_POOL_REQUIRED_VOTERS}
                step={1}
                value={requiredVoters}
                onChange={event => setRequiredVoters(event.target.value)}
                className="input input-bordered bg-base-100"
              />
            </div>
            <div className="form-control">
              <BountyFieldLabel htmlFor={requiredRoundsInputId} tooltip={SETTLED_ROUNDS_TOOLTIP}>
                Settled rounds
              </BountyFieldLabel>
              <input
                id={requiredRoundsInputId}
                type="number"
                min={MIN_REWARD_POOL_SETTLED_ROUNDS}
                step={1}
                value={requiredRounds}
                onChange={event => setRequiredRounds(event.target.value)}
                className="input input-bordered bg-base-100"
              />
            </div>
          </div>

          <div className="form-control">
            <BountyFieldLabel htmlFor={expiryDaysInputId} tooltip={REFUND_AFTER_TOOLTIP}>
              Refund if not filled after
            </BountyFieldLabel>
            <input
              id={expiryDaysInputId}
              type="number"
              min={1}
              step={1}
              value={expiryDays}
              onChange={event => setExpiryDays(event.target.value)}
              className="input input-bordered bg-base-100"
            />
          </div>

          {!escrowAddress ? (
            <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
              Bounty funding is not available on this network yet.
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
