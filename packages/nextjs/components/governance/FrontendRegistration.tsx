"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import { useAccount } from "wagmi";
import { GasBalanceWarning } from "~~/components/shared/GasBalanceWarning";
import { surfaceSectionHeadingClassName } from "~~/components/shared/sectionHeading";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useDeployedContractInfo, useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useFrontendClaimableFees } from "~~/hooks/useFrontendClaimableFees";
import { useGasBalanceStatus } from "~~/hooks/useGasBalanceStatus";
import { useThirdwebSponsoredSubmitCalls } from "~~/hooks/useThirdwebSponsoredSubmitCalls";
import {
  getGasBalanceErrorMessage,
  isFreeTransactionExhaustedError,
  isInsufficientFundsError,
} from "~~/lib/transactionErrors";
import scaffoldConfig from "~~/scaffold.config";
import { notification } from "~~/utils/scaffold-eth";
import { ZERO_ADDRESS } from "~~/utils/scaffold-eth/common";

const STAKE_AMOUNT = 1000; // Fixed 1,000 cREP stake

/**
 * Frontend Registration section for developers to register as frontend operators
 */
export function FrontendRegistration() {
  const { address } = useAccount();
  const { canSponsorTransactions, isMissingGasBalance, nativeTokenSymbol } = useGasBalanceStatus({
    includeExternalSendCalls: true,
  });
  const { canUseSponsoredSubmitCalls, executeSponsoredCalls } = useThirdwebSponsoredSubmitCalls();
  const [isRegistering, setIsRegistering] = useState(false);
  const [isDeregistering, setIsDeregistering] = useState(false);
  const [isCompletingDeregister, setIsCompletingDeregister] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isClaimingAllRoundFees, setIsClaimingAllRoundFees] = useState(false);
  const [claimingRoundKey, setClaimingRoundKey] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const configuredFrontendCode = scaffoldConfig.frontendCode;
  const deploymentIsConfigured = !!configuredFrontendCode;
  const deploymentMatchesConnectedAddress =
    !!address && !!configuredFrontendCode && configuredFrontendCode.toLowerCase() === address.toLowerCase();

  // Contract info
  const { data: frontendRegistryInfo } = useDeployedContractInfo({ contractName: "FrontendRegistry" });
  const { data: crepInfo } = useDeployedContractInfo({ contractName: "CuryoReputation" });
  const { data: rewardDistributorInfo } = useDeployedContractInfo({ contractName: "RoundRewardDistributor" });
  const frontendRegistryAddress = frontendRegistryInfo?.address as `0x${string}` | undefined;
  const crepAddress = crepInfo?.address as `0x${string}` | undefined;
  const rewardDistributorAddress = rewardDistributorInfo?.address as `0x${string}` | undefined;
  const { writeContractAsync: writeRewardDistributor } = useScaffoldWriteContract({
    contractName: "RoundRewardDistributor",
  });

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

  const { data: frontendVoterIdAddress } = useScaffoldReadContract({
    contractName: "FrontendRegistry",
    functionName: "voterIdNFT",
  });

  const requiresVoterId = !!frontendVoterIdAddress && frontendVoterIdAddress !== ZERO_ADDRESS;
  const { data: hasVoterId } = useScaffoldReadContract({
    contractName: "VoterIdNFT",
    functionName: "hasVoterId",
    args: [address],
    query: { enabled: !!address && requiresVoterId },
  });
  const { data: resolvedVoterIdHolder } = useScaffoldReadContract({
    contractName: "VoterIdNFT",
    functionName: "resolveHolder",
    args: [address],
    query: { enabled: !!address && requiresVoterId },
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
  const isEligible = frontendInfo ? frontendInfo[2] : false;
  const isSlashed = frontendInfo ? frontendInfo[3] : false;
  const exitAvailableAt = exitAvailableAtRaw ? Number(exitAvailableAtRaw) : 0;
  const isExitPending = exitAvailableAt > 0;
  const canCompleteDeregister = isExitPending && nowMs >= exitAvailableAt * 1000;
  const exitAvailableAtLabel = isExitPending ? new Date(exitAvailableAt * 1000).toLocaleString() : "";
  const canRegisterWithCurrentAddress =
    !requiresVoterId ||
    (hasVoterId === true && !!address && resolvedVoterIdHolder?.toLowerCase() === address.toLowerCase());

  // Parse fees (cREP only)
  const curyoFees = accumulatedFees ? Number(accumulatedFees) / 1e6 : 0;
  const hasFees = curyoFees > 0;

  // cREP balance
  const crepFormatted = crepBalance ? Number(crepBalance) / 1e6 : 0;
  const {
    items: claimableRoundFees,
    totalClaimable: totalClaimableRoundFees,
    isLoading: claimableRoundFeesLoading,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch: refetchClaimableRoundFees,
  } = useFrontendClaimableFees(isRegistered && address ? (address as `0x${string}`) : undefined);
  const totalClaimableRoundFeesFormatted = Number(totalClaimableRoundFees) / 1e6;

  useEffect(() => {
    if (!isExitPending) return;

    setNowMs(Date.now());
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isExitPending]);

  const ensureGasBalance = () => {
    if (!isMissingGasBalance) {
      return true;
    }

    notification.error(getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions }));
    return false;
  };

  const notifyTransactionError = (error: unknown, fallback: string) => {
    notification.error(
      isFreeTransactionExhaustedError(error) || isInsufficientFundsError(error)
        ? getGasBalanceErrorMessage(nativeTokenSymbol, { canSponsorTransactions })
        : (error as { shortMessage?: string } | undefined)?.shortMessage || fallback,
    );
  };

  const handleRegister = async () => {
    if (!address || !frontendRegistryInfo || !frontendRegistryAddress) return;
    if (!ensureGasBalance()) return;

    if (!canRegisterWithCurrentAddress) {
      notification.error("This wallet must hold a Voter ID directly before it can register as a frontend.");
      return;
    }

    if (crepFormatted < STAKE_AMOUNT) {
      notification.error("Insufficient cREP balance");
      return;
    }

    setIsRegistering(true);
    try {
      const amountWei = BigInt(STAKE_AMOUNT * 1e6);

      if (canUseSponsoredSubmitCalls && crepInfo && crepAddress) {
        await executeSponsoredCalls([
          {
            abi: crepInfo.abi,
            address: crepAddress,
            args: [frontendRegistryAddress, amountWei],
            functionName: "approve",
          },
          {
            abi: frontendRegistryInfo.abi,
            address: frontendRegistryAddress,
            functionName: "register",
          },
        ]);
      } else {
        await writeCRep({
          functionName: "approve",
          args: [frontendRegistryAddress, amountWei],
        });

        if (!address) {
          notification.error("Wallet disconnected after approval. Please reconnect and retry.");
          return;
        }

        await writeFrontendRegistryNoSim({
          functionName: "register",
        });
      }
      notification.success("Registered.");

      refetchFrontendInfo();
      refetchCuryo();
    } catch (e: any) {
      console.error("Registration failed:", e);
      notifyTransactionError(e, "Failed to register");
    } finally {
      setIsRegistering(false);
    }
  };

  const handleDeregister = async () => {
    if (!address || !frontendRegistryInfo || !frontendRegistryAddress) return;
    if (!ensureGasBalance()) return;

    setIsDeregistering(true);
    try {
      if (canUseSponsoredSubmitCalls) {
        await executeSponsoredCalls([
          {
            abi: frontendRegistryInfo.abi,
            address: frontendRegistryAddress,
            functionName: "requestDeregister",
          },
        ]);
      } else {
        await writeFrontendRegistry({
          functionName: "requestDeregister",
        });
      }

      notification.success("Exit started.");
      refetchFrontendInfo();
      refetchExitAvailableAt();
      refetchFees();
      refetchCuryo();
    } catch (e: any) {
      console.error("Deregister failed:", e);
      notifyTransactionError(e, "Failed to deregister");
    } finally {
      setIsDeregistering(false);
    }
  };

  const handleCompleteDeregister = async () => {
    if (!address || !frontendRegistryInfo || !frontendRegistryAddress) return;
    if (!ensureGasBalance()) return;

    setIsCompletingDeregister(true);
    try {
      if (canUseSponsoredSubmitCalls) {
        await executeSponsoredCalls([
          {
            abi: frontendRegistryInfo.abi,
            address: frontendRegistryAddress,
            functionName: "completeDeregister",
          },
        ]);
      } else {
        await writeFrontendRegistry({
          functionName: "completeDeregister",
        });
      }

      notification.success("Deregistration completed. Stake and pending fees withdrawn.");
      refetchFrontendInfo();
      refetchExitAvailableAt();
      refetchFees();
      refetchCuryo();
    } catch (e: any) {
      console.error("Complete deregister failed:", e);
      notifyTransactionError(e, "Failed to complete deregistration");
    } finally {
      setIsCompletingDeregister(false);
    }
  };

  const handleClaimFees = async () => {
    if (!address || !hasFees || !frontendRegistryInfo || !frontendRegistryAddress) return;
    if (!ensureGasBalance()) return;

    setIsClaiming(true);
    try {
      if (canUseSponsoredSubmitCalls) {
        await executeSponsoredCalls([
          {
            abi: frontendRegistryInfo.abi,
            address: frontendRegistryAddress,
            functionName: "claimFees",
          },
        ]);
      } else {
        await writeFrontendRegistry({
          functionName: "claimFees",
        });
      }

      notification.success(`Claimed ${curyoFees.toFixed(2)} cREP!`);
      refetchFees();
    } catch (e: any) {
      console.error("Claim failed:", e);
      notifyTransactionError(e, "Failed to claim fees");
    } finally {
      setIsClaiming(false);
    }
  };

  const handleClaimRoundFee = async (contentId: string, roundId: string, claimableFee: string) => {
    if (!address) return;
    if (!ensureGasBalance()) return;

    const roundKey = `${contentId}-${roundId}`;
    setClaimingRoundKey(roundKey);
    try {
      if (canUseSponsoredSubmitCalls && rewardDistributorInfo && rewardDistributorAddress) {
        await executeSponsoredCalls([
          {
            abi: rewardDistributorInfo.abi,
            address: rewardDistributorAddress,
            args: [BigInt(contentId), BigInt(roundId), address],
            functionName: "claimFrontendFee",
          },
        ]);
      } else {
        await writeRewardDistributor({
          functionName: "claimFrontendFee",
          args: [BigInt(contentId), BigInt(roundId), address],
        });
      }

      notification.success(`Credited ${(Number(BigInt(claimableFee)) / 1e6).toFixed(2)} cREP from round ${roundId}.`);
      await Promise.all([refetchClaimableRoundFees(), refetchFees()]);
    } catch (e: any) {
      console.error("Frontend round fee claim failed:", e);
      notifyTransactionError(e, "Failed to credit round fee");
    } finally {
      setClaimingRoundKey(current => (current === roundKey ? null : current));
    }
  };

  const handleClaimAllRoundFees = async () => {
    if (!address || claimableRoundFees.length === 0) return;
    if (!ensureGasBalance()) return;

    setIsClaimingAllRoundFees(true);
    let claimedCount = 0;

    try {
      if (canUseSponsoredSubmitCalls && rewardDistributorInfo && rewardDistributorAddress) {
        await executeSponsoredCalls(
          claimableRoundFees.map(item => ({
            abi: rewardDistributorInfo.abi,
            address: rewardDistributorAddress,
            args: [BigInt(item.contentId), BigInt(item.roundId), address],
            functionName: "claimFrontendFee",
          })),
        );
        claimedCount = claimableRoundFees.length;
      } else {
        for (const item of claimableRoundFees) {
          try {
            await writeRewardDistributor({
              functionName: "claimFrontendFee",
              args: [BigInt(item.contentId), BigInt(item.roundId), address],
            });
            claimedCount += 1;
          } catch (error) {
            console.error(`Failed to claim frontend fee for ${item.contentId}-${item.roundId}:`, error);
          }
        }
      }

      if (claimedCount > 0) {
        notification.success(
          `Credited frontend fees from ${claimedCount} settled round${claimedCount === 1 ? "" : "s"}.`,
        );
      }
      if (claimedCount < claimableRoundFees.length) {
        notification.warning("Some frontend fee claims failed. You can retry the remaining rounds individually.");
      }

      await Promise.all([refetchClaimableRoundFees(), refetchFees()]);
    } catch (e: any) {
      console.error("Claim all frontend round fees failed:", e);
      notifyTransactionError(e, "Failed to credit round fees");
    } finally {
      setIsClaimingAllRoundFees(false);
      setClaimingRoundKey(null);
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
    if (isEligible) {
      return <span className="px-2 py-0.5 rounded-full text-base font-medium bg-success/20 text-success">Active</span>;
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-base font-medium bg-warning/20 text-warning">Underbonded</span>
    );
  };

  return (
    <div className="surface-card rounded-2xl p-6 space-y-5">
      <div className="flex items-center gap-2">
        <h2 className={surfaceSectionHeadingClassName}>Frontend Registration</h2>
        <InfoTooltip text="Stake 1,000 cREP to earn frontend fees from votes through your interface." />
      </div>

      <p className="text-base text-base-content/60">
        Stake 1,000 cREP and earn frontend fees.{" "}
        <Link href="/docs/frontend-codes" className="link link-primary">
          Learn more →
        </Link>
      </p>

      {isMissingGasBalance && <GasBalanceWarning nativeTokenSymbol={nativeTokenSymbol} />}

      <div className="rounded-2xl bg-base-300 p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">This deployment&apos;s frontend code</p>
          {deploymentIsConfigured ? (
            <span className="rounded-full bg-success/15 px-2 py-0.5 text-sm font-medium text-success">Configured</span>
          ) : (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 text-sm font-medium text-warning">Missing</span>
          )}
        </div>
        {deploymentIsConfigured ? (
          <div className="flex items-center gap-2 text-base">
            <Address address={configuredFrontendCode} />
          </div>
        ) : (
          <p className="text-sm text-base-content/70">
            Set <code>NEXT_PUBLIC_FRONTEND_CODE</code> to the frontend operator address before launch. Otherwise votes
            from this deployment will not accrue frontend fees.
          </p>
        )}
        {deploymentIsConfigured && !deploymentMatchesConnectedAddress && (
          <p className="text-sm text-warning">
            This deployment currently attributes votes to {configuredFrontendCode}, not the wallet connected here.
          </p>
        )}
        {deploymentMatchesConnectedAddress && (
          <p className="text-sm text-success">
            This deployment is already pointing at the connected frontend operator address.
          </p>
        )}
      </div>

      {!isRegistered ? (
        // Registration Form
        <div className="space-y-4">
          {/* Address being registered */}
          <div className="flex items-center gap-2 text-base">
            <span className="text-base-content/60">Registering address:</span>
            <Address address={address} />
          </div>

          {requiresVoterId && (
            <p className={`text-sm ${canRegisterWithCurrentAddress ? "text-success" : "text-warning"}`}>
              {canRegisterWithCurrentAddress
                ? "This wallet satisfies the Voter ID requirement for frontend registration."
                : "Frontend registration requires this wallet to hold a Voter ID directly."}
            </p>
          )}

          {/* Stake info */}
          <div className="surface-card-nested rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-base font-medium text-base-content">
                  Frontend Stake
                  <InfoTooltip text="Returned when you withdraw, forfeited if you act maliciously. Receive 1% of the losing stakes from votes via your interface" />
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold text-base-content">{STAKE_AMOUNT.toLocaleString()} cREP</span>
              </div>
            </div>
          </div>

          <button
            className="btn btn-submit w-full"
            onClick={handleRegister}
            disabled={
              isRegistering || isMissingGasBalance || crepFormatted < STAKE_AMOUNT || !canRegisterWithCurrentAddress
            }
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

          <div className="bg-secondary/10 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Unclaimed Round Fees</p>
                <p className="text-sm text-base-content/60">
                  Claim settled round fees into the registry first, then withdraw them below.
                </p>
              </div>
              <div className="text-right">
                <p className="text-base text-base-content/60">Claimable</p>
                <p className="text-lg font-bold text-secondary">{totalClaimableRoundFeesFormatted.toFixed(2)} cREP</p>
              </div>
            </div>

            {isSlashed ? (
              <p className="text-sm text-warning">Round fee claims stay locked while this frontend is slashed.</p>
            ) : claimableRoundFeesLoading && claimableRoundFees.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-base-content/60">
                <span className="loading loading-spinner loading-xs" />
                Scanning settled rounds for claimable frontend fees...
              </div>
            ) : claimableRoundFees.length === 0 ? (
              <p className="text-sm text-base-content/60">
                No unclaimed frontend fees were found in the settled rounds scanned so far.
              </p>
            ) : (
              <div className="space-y-3">
                <button
                  className="btn btn-submit btn-sm w-full"
                  onClick={handleClaimAllRoundFees}
                  disabled={isClaimingAllRoundFees || isMissingGasBalance || isSlashed}
                >
                  {isClaimingAllRoundFees ? (
                    <span className="flex items-center gap-2">
                      <span className="loading loading-spinner loading-xs" />
                      Claiming round fees...
                    </span>
                  ) : (
                    "Claim All Round Fees"
                  )}
                </button>

                <div className="space-y-2">
                  {claimableRoundFees.map(item => {
                    const roundKey = `${item.contentId}-${item.roundId}`;
                    const isClaimingRound = claimingRoundKey === roundKey;

                    return (
                      <div key={roundKey} className="rounded-xl border border-base-300 bg-base-100/40 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium line-clamp-2">
                              {item.title || item.url || `Content ${item.contentId}`}
                            </p>
                            <p className="text-sm text-base-content/60">
                              Round {item.roundId}
                              {item.settledAt
                                ? ` • Settled ${new Date(Number(item.settledAt) * 1000).toLocaleString()}`
                                : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm text-base-content/60">Claimable</p>
                            <p className="font-semibold">{(Number(BigInt(item.claimableFee)) / 1e6).toFixed(2)} cREP</p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <p className="text-xs text-base-content/50 truncate">
                            Pool {(Number(BigInt(item.totalFrontendPool)) / 1e6).toFixed(2)} cREP
                          </p>
                          <button
                            className="btn btn-outline btn-primary btn-sm"
                            onClick={() => handleClaimRoundFee(item.contentId, item.roundId, item.claimableFee)}
                            disabled={isClaimingRound || isClaimingAllRoundFees || isMissingGasBalance || isSlashed}
                          >
                            {isClaimingRound ? <span className="loading loading-spinner loading-xs" /> : "Claim round"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {hasNextPage && (
                  <button
                    className="btn btn-ghost btn-sm w-full"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <span className="flex items-center gap-2">
                        <span className="loading loading-spinner loading-xs" />
                        Scanning older rounds...
                      </span>
                    ) : (
                      "Scan Older Settled Rounds"
                    )}
                  </button>
                )}
              </div>
            )}
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
                disabled={isClaiming || isMissingGasBalance || !hasFees || isExitPending}
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
                    disabled={isCompletingDeregister || isMissingGasBalance || !canCompleteDeregister}
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
                    disabled={isDeregistering || isMissingGasBalance}
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
