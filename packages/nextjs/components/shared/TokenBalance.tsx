"use client";

import { useAccount } from "wagmi";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

/**
 * Displays the user's cREP token balance in a compact pill.
 */
export function TokenBalance() {
  const { address } = useAccount();

  const {
    data: balance,
    isLoading,
    isError,
  } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [address],
  });

  if (!address) return null;

  // Format for 6 decimals
  const formatted = balance ? (Number(balance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0";

  return (
    <div className="flex items-center gap-2 surface-card rounded-full px-3 py-1.5">
      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
        <span className="text-base font-bold text-primary-content">C</span>
      </div>
      {isLoading ? (
        <span className="inline-block w-10 h-4 bg-base-content/10 rounded animate-pulse" />
      ) : isError ? (
        <span className="text-base text-base-content/40">--</span>
      ) : (
        <span className="text-base font-semibold">{formatted}</span>
      )}
      <span className="text-base text-base-content/40">cREP</span>
    </div>
  );
}
