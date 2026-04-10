"use client";

import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useClaimAll } from "~~/hooks/useClaimAll";

function formatCrepAmount(value: bigint) {
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

type ClaimRewardsButtonProps = {
  buttonClassName?: string;
  className?: string;
  showTokenSymbol?: boolean;
};

export function ClaimRewardsButton({ buttonClassName, className, showTokenSymbol = true }: ClaimRewardsButtonProps) {
  const { claimableItems, totalClaimable, refetch: refetchClaimable } = useAllClaimableRewards();
  const { claimAll, isClaiming, isPreparingClaim, progress } = useClaimAll();

  if (totalClaimable <= 0n) {
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
        {isPreparingClaim
          ? "Preparing..."
          : isClaiming
            ? `Claim ${progress.current}/${progress.total}`
            : `Claim ${formatCrepAmount(totalClaimable)}${showTokenSymbol ? " cREP" : ""}`}
      </button>
    </div>
  );
}
