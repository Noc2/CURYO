"use client";

import { BuildingLibraryIcon } from "@heroicons/react/24/outline";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export const TreasuryBalance = () => {
  // Read timelock (treasury) address from CategoryRegistry
  const { data: treasuryAddress } = useScaffoldReadContract({
    contractName: "CategoryRegistry",
    functionName: "timelock",
  });

  // Read cREP balance of treasury
  const { data: treasuryBalanceRaw, isLoading: balanceLoading } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "balanceOf",
    args: [treasuryAddress],
    query: {
      enabled: !!treasuryAddress,
    },
  });

  const formatBalance = (balance: bigint | undefined) => {
    if (balance == null) return "0";
    return (Number(balance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
  };

  return (
    <div className="surface-card rounded-2xl p-6" style={{ background: "#121212" }}>
      <div className="flex items-center gap-2">
        <BuildingLibraryIcon className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Treasury</h2>
        <InfoTooltip
          text="Governance-controlled treasury funded by 1% settlement fee, slashed stakes, and forfeited votes. Spent via governance proposals."
          className="[&>svg]:opacity-60"
        />
      </div>

      {balanceLoading ? (
        <div className="h-9 w-40 bg-base-content/10 rounded animate-pulse mt-3" />
      ) : (
        <p className="text-3xl font-bold tabular-nums mt-3">{formatBalance(treasuryBalanceRaw)} cREP</p>
      )}
    </div>
  );
};
