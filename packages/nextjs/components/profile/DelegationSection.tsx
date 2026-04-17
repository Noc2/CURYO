"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatUnits, isAddress, parseUnits } from "viem";
import { useAccount } from "wagmi";
import { ArrowsRightLeftIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useDelegation } from "~~/hooks/useDelegation";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { formatCrepAmount } from "~~/lib/vote/voteIncentives";
import { notification } from "~~/utils/scaffold-eth";
import { ZERO_ADDRESS } from "~~/utils/scaffold-eth/common";

const CREP_DECIMALS = 6;

function parseCrepAmount(value: string): bigint | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    return parseUnits(trimmedValue, CREP_DECIMALS);
  } catch {
    return null;
  }
}

export function DelegationSection() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { hasVoterId, isLoading: voterIdLoading } = useVoterIdNFT(address);
  const {
    delegateTo,
    hasDelegate,
    isDelegate,
    delegateOf,
    isLoading,
    isPending: isDelegationPending,
    writeContractAsync,
    refetch,
  } = useDelegation(address);
  const { data: crepBalance, refetch: refetchCrepBalance } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!address },
  });
  const { writeContractAsync: writeCrepContractAsync, isPending: isTransferPending } = useScaffoldWriteContract({
    contractName: "CuryoReputation",
  });

  const [delegateInput, setDelegateInput] = useState("");
  const [transferAddressInput, setTransferAddressInput] = useState("");
  const [transferAmountInput, setTransferAmountInput] = useState("");
  const [delegationError, setDelegationError] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  const normalizedDelegateInput = delegateInput.trim();
  const isValidAddress = normalizedDelegateInput.length > 0 && isAddress(normalizedDelegateInput);
  const isSelfAddress = normalizedDelegateInput.toLowerCase() === address?.toLowerCase();
  const crepBalanceMicro = typeof crepBalance === "bigint" ? crepBalance : 0n;
  const formattedBalance = formatCrepAmount(crepBalanceMicro, 6);

  const normalizedTransferAddress = transferAddressInput.trim();
  const parsedTransferAmount = useMemo(() => parseCrepAmount(transferAmountInput), [transferAmountInput]);
  const hasTransferAmount = transferAmountInput.trim().length > 0;
  const isValidTransferAddress = normalizedTransferAddress.length > 0 && isAddress(normalizedTransferAddress);
  const isTransferSelfAddress = normalizedTransferAddress.toLowerCase() === address?.toLowerCase();
  const isTransferZeroAddress = normalizedTransferAddress.toLowerCase() === ZERO_ADDRESS.toLowerCase();
  const isValidTransferAmount = parsedTransferAmount !== null && parsedTransferAmount > 0n;
  const exceedsTransferBalance = parsedTransferAmount !== null && parsedTransferAmount > crepBalanceMicro;
  const canSubmitTransfer =
    isValidTransferAddress &&
    !isTransferZeroAddress &&
    !isTransferSelfAddress &&
    isValidTransferAmount &&
    !exceedsTransferBalance;

  const handleSetDelegate = async () => {
    if (!isValidAddress) {
      setDelegationError("Enter a valid address");
      return;
    }
    if (isSelfAddress) {
      setDelegationError("Cannot delegate to yourself");
      return;
    }
    setDelegationError(null);

    try {
      await (writeContractAsync as any)({
        functionName: "setDelegate",
        args: [normalizedDelegateInput],
      });
      notification.success("Delegate set successfully!");
      setDelegateInput("");
      setTransferAddressInput(currentValue =>
        currentValue.trim().length > 0 ? currentValue : normalizedDelegateInput,
      );
      refetch();
    } catch (e: any) {
      console.error("Set delegate failed:", e);
      const msg = e?.shortMessage || e?.message || "Failed to set delegate";
      if (msg.includes("DelegateIsHolder")) {
        setDelegationError("That address already has its own Voter ID");
      } else if (msg.includes("DelegateAlreadyAssigned")) {
        setDelegationError("That address is already delegated");
      } else {
        setDelegationError(msg);
      }
    }
  };

  const handleRemoveDelegate = async () => {
    setDelegationError(null);
    try {
      await (writeContractAsync as any)({
        functionName: "removeDelegate",
      });
      notification.success("Delegate removed!");
      refetch();
    } catch (e: any) {
      console.error("Remove delegate failed:", e);
      setDelegationError(e?.shortMessage || "Failed to remove delegate");
    }
  };

  const handleTransfer = async () => {
    if (!isValidTransferAddress) {
      setTransferError("Enter a valid address");
      return;
    }
    if (isTransferZeroAddress) {
      setTransferError("Cannot send to the zero address");
      return;
    }
    if (isTransferSelfAddress) {
      setTransferError("Cannot send to yourself");
      return;
    }
    if (!isValidTransferAmount || parsedTransferAmount === null) {
      setTransferError("Enter a valid amount");
      return;
    }
    if (exceedsTransferBalance) {
      setTransferError("Amount exceeds your balance");
      return;
    }

    setTransferError(null);

    try {
      await writeCrepContractAsync({
        functionName: "transfer",
        args: [normalizedTransferAddress as `0x${string}`, parsedTransferAmount],
      });
      notification.success(`Sent ${formatCrepAmount(parsedTransferAmount, 6)} cREP`);
      setTransferAmountInput("");
      await refetchCrepBalance();
      void queryClient.invalidateQueries();
    } catch (e: any) {
      console.error("Transfer cREP failed:", e);
      setTransferError(e?.shortMessage || e?.message || "Failed to transfer cREP");
    }
  };

  if (voterIdLoading || isLoading) {
    return (
      <div className="surface-card rounded-2xl p-6">
        <div className="flex items-center justify-center py-8">
          <span className="loading loading-spinner loading-md"></span>
          <span className="ml-2 text-base-content/50">Loading delegation...</span>
        </div>
      </div>
    );
  }

  if (!hasVoterId) {
    return null;
  }

  return (
    <div className="surface-card rounded-2xl p-6 space-y-5">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <ShieldCheckIcon className="w-6 h-6" />
        Delegated Vote ID
        <InfoTooltip text="Authorize a delegate address (hot wallet) to vote on behalf of your Voter ID. Your main key stays safely offline." />
      </h2>

      <div className="rounded-xl border border-base-300 bg-base-200/40 p-4 text-base text-base-content/75 space-y-2">
        <p>Keep your Voter ID on a cold wallet and use a separate hot wallet for daily actions.</p>
        <p>
          Your delegate can vote and use profile or frontend actions, but only the Voter ID holder can set or remove
          delegation. Submissions themselves do not need delegation.
        </p>
        <p>
          If the hot wallet is compromised, remove it here, set a new delegate, and only fund the delegate as needed.
        </p>
      </div>

      {/* Current delegation status */}
      {hasDelegate && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4 space-y-3">
          <p className="text-base font-medium text-success">Active delegate</p>
          <p className="text-base font-mono break-all">{delegateTo}</p>
          <button
            onClick={handleRemoveDelegate}
            className="btn btn-outline btn-error btn-sm"
            disabled={isDelegationPending}
          >
            {isDelegationPending ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-xs"></span>
                Removing...
              </span>
            ) : (
              "Remove Delegate"
            )}
          </button>
        </div>
      )}

      {isDelegate && (
        <div className="bg-info/10 border border-info/20 rounded-xl p-4">
          <p className="text-base font-medium text-info">You are a delegate for</p>
          <p className="text-base font-mono break-all">{delegateOf}</p>
        </div>
      )}

      {/* Set delegate form */}
      {!hasDelegate && (
        <div className="space-y-3">
          <label className="flex items-center gap-1.5 text-base font-medium">
            Delegate Address
            <InfoTooltip text="Enter the address of your secondary wallet. This address will be able to vote using your Voter ID." />
          </label>
          <input
            type="text"
            aria-label="Delegate address"
            placeholder="0x..."
            className={`input input-bordered w-full bg-base-100 font-mono ${
              delegateInput.length > 0 && !isValidAddress ? "input-error" : ""
            }`}
            value={delegateInput}
            onChange={e => {
              setDelegateInput(e.target.value);
              if (delegationError) {
                setDelegationError(null);
              }
            }}
            disabled={isDelegationPending}
          />
          {delegateInput.length > 0 && !isValidAddress && (
            <p className="text-error text-base">Enter a valid Ethereum address</p>
          )}
          {isSelfAddress && <p className="text-warning text-base">Cannot delegate to yourself</p>}

          <button
            onClick={handleSetDelegate}
            className="btn btn-submit w-full"
            disabled={isDelegationPending || !isValidAddress || isSelfAddress}
          >
            {isDelegationPending ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm"></span>
                Setting delegate...
              </span>
            ) : (
              "Set Delegate"
            )}
          </button>
        </div>
      )}

      {delegationError && (
        <div className="bg-error/10 rounded-lg p-4">
          <p className="text-error text-base">{delegationError}</p>
        </div>
      )}

      <div className="border-t border-base-300 pt-5 space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <ArrowsRightLeftIcon className="w-5 h-5" />
          Transfer cREP
          <InfoTooltip text="Send cREP to your delegate or any other address." />
        </h3>

        <div className="space-y-1 text-base text-base-content/60">
          <p>Balance {formattedBalance} cREP</p>
          {address ? <p className="font-mono text-sm break-all">Connected wallet {address}</p> : null}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <label className="text-base font-medium">Recipient</label>
            {hasDelegate && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  setTransferAddressInput(delegateTo);
                  if (transferError) {
                    setTransferError(null);
                  }
                }}
                disabled={isTransferPending}
              >
                Use delegate
              </button>
            )}
          </div>
          <input
            type="text"
            aria-label="Transfer recipient"
            inputMode="text"
            placeholder="0x..."
            className={`input input-bordered w-full bg-base-100 font-mono ${
              normalizedTransferAddress.length > 0 && !isValidTransferAddress ? "input-error" : ""
            }`}
            value={transferAddressInput}
            onChange={e => {
              setTransferAddressInput(e.target.value);
              if (transferError) {
                setTransferError(null);
              }
            }}
            disabled={isTransferPending}
          />
          {normalizedTransferAddress.length > 0 && !isValidTransferAddress && (
            <p className="text-error text-base">Enter a valid address</p>
          )}
          {isValidTransferAddress && isTransferZeroAddress && (
            <p className="text-warning text-base">Cannot send to the zero address</p>
          )}
          {isTransferSelfAddress && <p className="text-warning text-base">Cannot send to yourself</p>}

          <div className="flex items-center justify-between gap-3">
            <label className="text-base font-medium">Amount</label>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                setTransferAmountInput(formatUnits(crepBalanceMicro, CREP_DECIMALS));
                if (transferError) {
                  setTransferError(null);
                }
              }}
              disabled={isTransferPending || crepBalanceMicro === 0n}
            >
              Max
            </button>
          </div>
          <input
            type="text"
            aria-label="Transfer amount"
            inputMode="decimal"
            placeholder="0.0"
            className={`input input-bordered w-full bg-base-100 font-mono ${
              hasTransferAmount && !isValidTransferAmount ? "input-error" : ""
            }`}
            value={transferAmountInput}
            onChange={e => {
              setTransferAmountInput(e.target.value);
              if (transferError) {
                setTransferError(null);
              }
            }}
            disabled={isTransferPending}
          />
          {hasTransferAmount && parsedTransferAmount === null && (
            <p className="text-error text-base">Enter a valid amount</p>
          )}
          {parsedTransferAmount === 0n && <p className="text-warning text-base">Amount must be greater than 0</p>}
          {exceedsTransferBalance && <p className="text-warning text-base">Amount exceeds your balance</p>}

          <button
            onClick={handleTransfer}
            className="btn btn-submit w-full"
            disabled={isTransferPending || !canSubmitTransfer}
          >
            {isTransferPending ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm"></span>
                Sending...
              </span>
            ) : (
              "Send cREP"
            )}
          </button>
        </div>

        {transferError && (
          <div className="bg-error/10 rounded-lg p-4">
            <p className="text-error text-base">{transferError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
