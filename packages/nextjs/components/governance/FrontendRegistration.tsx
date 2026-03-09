"use client";

import { useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { useAccount } from "wagmi";
import { CodeBracketIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { notification } from "~~/utils/scaffold-eth";

const STAKE_AMOUNT = 1000; // Fixed 1,000 cREP stake

/**
 * Frontend Registration section for developers to register as frontend operators
 */
export function FrontendRegistration() {
  const { address } = useAccount();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isDeregistering, setIsDeregistering] = useState(false);
  const [isCompletingDeregister, setIsCompletingDeregister] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);

  // Contract info
  const { data: frontendRegistryInfo } = useDeployedContractInfo({ contractName: "FrontendRegistry" });

  // Read frontend info
  const { data: frontendInfo, refetch: refetchFrontendInfo } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getFrontendInfo",
    args: [address],
  });

  // Read accumulated fees
  const { data: accumulatedFees, refetch: refetchFees } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "getAccumulatedFees",
    args: [address],
  });

  const { data: exitAvailableAtRaw, refetch: refetchExitAvailableAt } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "frontendExitAvailableAt",
    args: [address],
  });

  // Read cREP balance
  const { data: crepBalance, refetch: refetchCuryo } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  // Write contracts
  const { writeContractAsync: writeCRep } = useScaffoldWriteContract({ contractName: "CuryoReputation" });
  const { writeContractAsync: writeFrontendRegistry } = useScaffoldWriteContract({ contractName: "FrontendRegistry" });
  // Separate hook with simulation disabled for register (follows an approve tx,
  // so the simulation may run against stale state before the approve is reflected).
  const { writeContractAsync: writeFrontendRegistryNoSim } = useScaffoldWriteContract({
    contractName: "FrontendRegistry",
    disableSimulate: true,
  });

  // Parse frontend info
  const isRegistered = frontendInfo && frontendInfo[1] > 0n; // stakedAmount > 0
  const stakedAmount = frontendInfo ? Number(frontendInfo[1]) / 1e6 : 0;
  const isApproved = frontendInfo ? frontendInfo[2] : false;
  const isSlashed = frontendInfo ? frontendInfo[3] : false;
  const exitAvailableAt = exitAvailableAtRaw ? Number(exitAvailableAtRaw) : 0;
  const isExitPending = exitAvailableAt > 0;
  const exitAvailableAtLabel = isExitPending ? new Date(exitAvailableAt * 1000).toLocaleString() : "";

  // Parse fees (cREP only)
  const curyoFees = accumulatedFees ? Number(accumulatedFees) / 1e6 : 0;
  const hasFees = curyoFees > 0;

  // cREP balance
  const crepFormatted = crepBalance ? Number(crepBalance) / 1e6 : 0;

  const handleRegister = async () => {
    if (!address || !frontendRegistryInfo?.address) return;

    if (crepFormatted < STAKE_AMOUNT) {
      notification.error("Insufficient cREP balance");
      return;
    }

    setIsRegistering(true);
    try {
      const amountWei = BigInt(STAKE_AMOUNT * 1e6);

      // Approve cREP for FrontendRegistry
      await writeCRep({
        functionName: "approve",
        args: [frontendRegistryInfo.address, amountWei],
      });

      // Re-check wallet before second tx
      if (!address) {
        notification.error("Wallet disconnected after approval. Please reconnect and retry.");
        return;
      }

      // Register as frontend operator (skip simulation — allowance state may be stale)
      await writeFrontendRegistryNoSim({
        functionName: "register",
      });

      notification.success("Registered as frontend operator! Awaiting governance approval.");
      refetchFrontendInfo();
      refetchCuryo();
    } catch (e: any) {
      console.error("Registration failed:", e);
      notification.error(e?.shortMessage || "Failed to register");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeregister = async () => {
    if (!address) return;

    setIsDeregistering(true);
    try {
      await writeFrontendRegistry({
        functionName: "deregister",
      });

      notification.success("Deregistration started. Complete it after the 14-day unbonding period.");
      refetchFrontendInfo();
      refetchExitAvailableAt();
      refetchFees();
      refetchCuryo();
    } catch (e: any) {
      console.error("Deregister failed:", e);
      notification.error(e?.shortMessage || "Failed to deregister");
    } finally {
      setIsDeregistering(false);
    }
  };

  const handleCompleteDeregister = async () => {
    if (!address) return;

    setIsCompletingDeregister(true);
    try {
      await writeFrontendRegistry({
        functionName: "completeDeregister",
      });

      notification.success("Deregistration completed. Stake and pending fees withdrawn.");
      refetchFrontendInfo();
      refetchExitAvailableAt();
      refetchFees();
      refetchCuryo();
    } catch (e: any) {
      console.error("Complete deregister failed:", e);
      notification.error(e?.shortMessage || "Failed to complete deregistration");
    } finally {
      setIsCompletingDeregister(false);
    }
  };

  const handleClaimFees = async () => {
    if (!address || !hasFees) return;

    setIsClaiming(true);
    try {
      await writeFrontendRegistry({
        functionName: "claimFees",
      });

      notification.success(`Claimed ${curyoFees.toFixed(2)} cREP!`);
      refetchFees();
    } catch (e: any) {
      console.error("Claim failed:", e);
      notification.error(e?.shortMessage || "Failed to claim fees");
    } finally {
      setIsClaiming(false);
    }
  };

  // Status badge
  const getStatusBadge = () => {
    if (isSlashed) {
      return <span className="px-2 py-0.5 rounded-full text-base font-medium bg-error/20 text-error">Penalized</span>;
    }
    if (isExitPending) {
      return <span className="px-2 py-0.5 rounded-full text-base font-medium bg-info/20 text-info">Exit Pending</span>;
    }
    if (isApproved) {
      return (
        <span className="px-2 py-0.5 rounded-full text-base font-medium bg-success/20 text-success">Approved</span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-base font-medium bg-warning/20 text-warning">
        Pending Approval
      </span>
    );
  };

  return (
    <div className="surface-card rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <CodeBracketIcon className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-bold">Frontend Registration</h2>
        <InfoTooltip text="Register as a frontend operator to receive 1% of the losing stakes from votes through your interface" />
      </div>

      <p className="text-base text-base-content/60">
        Build frontends or integrations for Curyo and earn frontend fees.{" "}
        <Link href="/docs/frontend-codes" className="link link-primary">
          Learn more →
        </Link>
      </p>

      {!isRegistered ? (
        // Registration Form
        <div className="space-y-4">
          {/* Address being registered */}
          <div className="flex items-center gap-2 text-base">
            <span className="text-base-content/60">Registering address:</span>
            <Address address={address} />
          </div>

          {/* Stake info */}
          <div
            className="rounded-2xl p-4"
            style={{
              background: "#112840",
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-base font-medium text-white">
                  Frontend Stake
                  <InfoTooltip text="Returned when you withdraw, forfeited if you act maliciously. Receive 1% of the losing stakes from votes via your interface" />
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold text-white">{STAKE_AMOUNT.toLocaleString()} cREP</span>
              </div>
            </div>
          </div>

          <button
            className="btn btn-submit w-full"
            onClick={handleRegister}
            disabled={isRegistering || crepFormatted < STAKE_AMOUNT}
          >
            {isRegistering ? (
              <span className="flex items-center gap-2">
                <span className="loading loading-spinner loading-sm" />
                Registering...
              </span>
            ) : (
              "Register as Frontend Operator"
            )}
          </button>
        </div>
      ) : (
        // Registered State
        <div className="space-y-4">
          {/* Registered address */}
          <div className="flex items-center gap-2 text-base">
            <span className="text-base-content/60">Registered address:</span>
            <Address address={address} />
          </div>

          {/* Status and Stats */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base-content/60">Status:</span>
              {getStatusBadge()}
            </div>
            <div className="text-right">
              <p className="text-base text-base-content/60">Staked</p>
              <p className="text-lg font-bold">{stakedAmount.toLocaleString()} cREP</p>
            </div>
          </div>

          {/* Accumulated Fees */}
          <div className="bg-primary/10 rounded-xl p-4">
            <p className="font-medium mb-3">Accumulated Fees</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base text-base-content/60">cREP</p>
                <p className="text-lg font-bold text-primary">{curyoFees.toFixed(2)}</p>
              </div>
              <button
                className="btn btn-submit btn-sm"
                onClick={handleClaimFees}
                disabled={isClaiming || !hasFees || isExitPending}
              >
                {isClaiming ? <span className="loading loading-spinner loading-xs" /> : "Claim"}
              </button>
            </div>
            {isExitPending && (
              <p className="text-sm text-base-content/50 mt-2">Fee withdrawals stay locked until exit is completed.</p>
            )}
          </div>

          {/* Deregister */}
          {!isSlashed && (
            <div className="pt-2 border-t border-base-300">
              {isExitPending ? (
                <>
                  <button
                    className="btn btn-outline btn-error btn-sm w-full"
                    onClick={handleCompleteDeregister}
                    disabled={isCompletingDeregister}
                  >
                    {isCompletingDeregister ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      "Complete Deregistration"
                    )}
                  </button>
                  <p className="text-sm text-base-content/50 mt-1">
                    Exit requested. Complete it after the unbonding period to withdraw your{" "}
                    {stakedAmount.toLocaleString()} cREP stake and any pending fees.
                    {exitAvailableAtLabel ? ` Available after ${exitAvailableAtLabel}.` : ""}
                  </p>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-outline btn-error btn-sm w-full"
                    onClick={handleDeregister}
                    disabled={isDeregistering}
                  >
                    {isDeregistering ? <span className="loading loading-spinner loading-xs" /> : "Start Deregistration"}
                  </button>
                  <p className="text-sm text-base-content/50 mt-1">
                    Starts a 14-day unbonding period. After that, you can complete deregistration to withdraw your{" "}
                    {stakedAmount.toLocaleString()} cREP stake and any pending fees.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
