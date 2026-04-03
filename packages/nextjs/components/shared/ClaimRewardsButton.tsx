"use client";

import { useAllClaimableRewards } from "~~/hooks/useAllClaimableRewards";
import { useClaimAll } from "~~/hooks/useClaimAll";

function formatCrepAmount(value: bigint) {
  return (Number(value) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

type ClaimRewardsButtonProps = {
  buttonClassName?: string;
  className?: string;
};

export function ClaimRewardsButton({ buttonClassName, className }: ClaimRewardsButtonProps) {
  const { claimableItems, totalClaimable, refetch: refetchClaimable } = useAllClaimableRewards();
  const { claimAll, isClaiming, progress } = useClaimAll();

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
        disabled={isClaiming}
        className={buttonClassName ?? "btn btn-primary btn-sm w-full"}
      >
        {isClaiming
          ? `Claiming ${progress.current}/${progress.total}...`
          : `Claim ${formatCrepAmount(totalClaimable)} cREP`}
      </button>
    </div>
  );
}
