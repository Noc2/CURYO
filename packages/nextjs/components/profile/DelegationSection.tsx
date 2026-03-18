"use client";

import { useState } from "react";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useDelegation } from "~~/hooks/useDelegation";
import { useVoterIdNFT } from "~~/hooks/useVoterIdNFT";
import { notification } from "~~/utils/scaffold-eth";

export function DelegationSection() {
  const { address } = useAccount();
  const { hasVoterId, isLoading: voterIdLoading } = useVoterIdNFT(address);
  const { delegateTo, hasDelegate, isDelegate, delegateOf, isLoading, isPending, writeContractAsync, refetch } =
    useDelegation(address);

  const [delegateInput, setDelegateInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isValidAddress = delegateInput.length > 0 && isAddress(delegateInput);
  const isSelfAddress = delegateInput.toLowerCase() === address?.toLowerCase();

  const handleSetDelegate = async () => {
    if (!isValidAddress) {
      setError("Please enter a valid Ethereum address");
      return;
    }
    if (isSelfAddress) {
      setError("Cannot delegate to yourself");
      return;
    }
    setError(null);

    try {
      await (writeContractAsync as any)({
        functionName: "setDelegate",
        args: [delegateInput],
      });
      notification.success("Delegate set successfully!");
      setDelegateInput("");
      refetch();
    } catch (e: any) {
      console.error("Set delegate failed:", e);
      const msg = e?.shortMessage || e?.message || "Failed to set delegate";
      if (msg.includes("DelegateIsHolder")) {
        setError("That address already has its own Voter ID and cannot be a delegate");
      } else if (msg.includes("DelegateAlreadyAssigned")) {
        setError("That address is already a delegate for another holder");
      } else {
        setError(msg);
      }
    }
  };

  const handleRemoveDelegate = async () => {
    setError(null);
    try {
      await (writeContractAsync as any)({
        functionName: "removeDelegate",
      });
      notification.success("Delegate removed!");
      refetch();
    } catch (e: any) {
      console.error("Remove delegate failed:", e);
      setError(e?.shortMessage || "Failed to remove delegate");
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
    return null; // ProfileForm already shows the Voter ID requirement
  }

  return (
    <div className="surface-card rounded-2xl p-6 space-y-5">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <ShieldCheckIcon className="w-6 h-6" />
        Delegated Vote ID
        <InfoTooltip text="Authorize a delegate address (hot wallet) to vote and submit content on behalf of your Voter ID. Your main key stays safely offline." />
      </h2>

      {/* Current delegation status */}
      {hasDelegate && (
        <div className="bg-success/10 border border-success/20 rounded-xl p-4 space-y-3">
          <p className="text-base font-medium text-success">Active delegate</p>
          <p className="text-base font-mono break-all">{delegateTo}</p>
          <button onClick={handleRemoveDelegate} className="btn btn-outline btn-error btn-sm" disabled={isPending}>
            {isPending ? (
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
            <InfoTooltip text="Enter the address of your secondary wallet. This address will be able to vote and submit content using your Voter ID." />
          </label>
          <input
            type="text"
            placeholder="0x..."
            className={`input input-bordered w-full bg-base-100 font-mono ${
              delegateInput.length > 0 && !isValidAddress ? "input-error" : ""
            }`}
            value={delegateInput}
            onChange={e => setDelegateInput(e.target.value)}
            disabled={isPending}
          />
          {delegateInput.length > 0 && !isValidAddress && (
            <p className="text-error text-base">Enter a valid Ethereum address</p>
          )}
          {isSelfAddress && <p className="text-warning text-base">Cannot delegate to yourself</p>}

          <button
            onClick={handleSetDelegate}
            className="btn btn-submit w-full"
            disabled={isPending || !isValidAddress || isSelfAddress}
          >
            {isPending ? (
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

      {/* Error */}
      {error && (
        <div className="bg-error/10 rounded-lg p-4">
          <p className="text-error text-base">{error}</p>
        </div>
      )}
    </div>
  );
}
