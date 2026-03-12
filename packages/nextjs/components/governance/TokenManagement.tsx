"use client";

import { useAccount } from "wagmi";
import { InfoTooltip } from "~~/components/ui/InfoTooltip";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

export const TokenManagement = () => {
  const { address } = useAccount();

  // Read voting power (from ERC20Votes)
  const { data: votingPowerRaw } = useScaffoldReadContract({
    contractName: "CuryoReputation",
    functionName: "getVotes" as any,
    args: [address] as any,
  });
  const votingPower = votingPowerRaw as bigint | undefined;

  // Format balances (6 decimals)
  const formatBalance = (balance: bigint | undefined) => {
    if (balance == null) return "0";
    return (Number(balance) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <div className="surface-card rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">Voting Power</h2>
        <InfoTooltip
          text="Your voting power equals your cREP balance. Activated automatically."
          className="[&>svg]:opacity-60"
        />
      </div>

      <p className="text-3xl font-bold tabular-nums mt-3">{formatBalance(votingPower)} cREP</p>
    </div>
  );
};
