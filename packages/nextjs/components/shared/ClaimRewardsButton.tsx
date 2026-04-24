"use client";

import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useClaimAll } from "~~/hooks/useClaimAll";
import { formatUsdAmount } from "~~/lib/questionRewardPools";

function formatHrepAmount(value: bigint) {
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

type ClaimRewardsButtonProps = {
  buttonClassName?: string;
  className?: string;
  showTokenSymbol?: boolean;
};

export function ClaimRewardsButton({ buttonClassName, className, showTokenSymbol = true }: ClaimRewardsButtonProps) {
  const {
    claimableItems,
    totalHrepClaimable,
    totalUsdcClaimable,
    refetch: refetchClaimable,
  } = useAllClaimableRewards();
  const { claimAll, isClaiming, isPreparingClaim, progress } = useClaimAll();

  if (claimableItems.length === 0 || (totalHrepClaimable <= 0n && totalUsdcClaimable <= 0n)) {
    return null;
  }

  const handleClaimAll = () => {
    void claimAll(claimableItems, () => refetchClaimable());
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClaimAll}
        disabled={isClaiming || isPreparingClaim}
        className={buttonClassName ?? "btn btn-primary btn-sm w-full"}
      >
        {isPreparingClaim ? "Preparing..." : isClaiming ? `Claim ${progress.current}/${progress.total}` : null}
        {!isPreparingClaim && !isClaiming && totalHrepClaimable > 0n && totalUsdcClaimable > 0n
          ? `Claim ${formatHrepAmount(totalHrepClaimable)}${showTokenSymbol ? " HREP" : ""} + ${formatUsdAmount(totalUsdcClaimable)}`
          : null}
        {!isPreparingClaim && !isClaiming && totalHrepClaimable > 0n && totalUsdcClaimable <= 0n
          ? `Claim ${formatHrepAmount(totalHrepClaimable)}${showTokenSymbol ? " HREP" : ""}`
          : null}
        {!isPreparingClaim && !isClaiming && totalHrepClaimable <= 0n && totalUsdcClaimable > 0n
          ? `Claim ${formatUsdAmount(totalUsdcClaimable)}`
          : null}
      </button>
    </div>
  );
}
