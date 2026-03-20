"use client";

import { useMemo } from "react";
import { useAccount, useBalance } from "wagmi";
import { useFreeTransactionAllowance } from "~~/hooks/useFreeTransactionAllowance";
import { useWalletExecutionCapabilities } from "~~/hooks/useWalletExecutionCapabilities";

export function useGasBalanceStatus() {
  const { address, chain } = useAccount();
  const { supportsSponsoredCalls } = useWalletExecutionCapabilities();
  const freeTransactionAllowance = useFreeTransactionAllowance();
  const { data: nativeBalance, isLoading: nativeBalanceLoading } = useBalance({
    address,
    query: {
      enabled: Boolean(address),
    },
  });

  return useMemo(() => {
    const nativeBalanceValue = nativeBalance?.value ?? 0n;
    const nativeTokenSymbol = chain?.nativeCurrency?.symbol ?? "CELO";
    const hasResolvedNativeBalance = Boolean(address) && !nativeBalanceLoading && nativeBalance !== undefined;
    const canSponsorTransactions = supportsSponsoredCalls && freeTransactionAllowance.canUseFreeTransactions;
    const isAwaitingFreeTransactionAllowance = supportsSponsoredCalls && !freeTransactionAllowance.isResolved;
    const isMissingGasBalance =
      hasResolvedNativeBalance &&
      nativeBalanceValue === 0n &&
      !canSponsorTransactions &&
      !isAwaitingFreeTransactionAllowance;

    return {
      canSponsorTransactions,
      freeTransactionLimit: freeTransactionAllowance.limit,
      freeTransactionRemaining: freeTransactionAllowance.remaining,
      freeTransactionVerified: freeTransactionAllowance.verified,
      hasResolvedNativeBalance,
      isAwaitingFreeTransactionAllowance,
      isMissingGasBalance,
      nativeBalanceValue,
      nativeTokenSymbol,
      supportsSponsoredCalls,
      voterIdTokenId: freeTransactionAllowance.voterIdTokenId,
    };
  }, [
    address,
    chain?.nativeCurrency?.symbol,
    freeTransactionAllowance.canUseFreeTransactions,
    freeTransactionAllowance.limit,
    freeTransactionAllowance.remaining,
    freeTransactionAllowance.isResolved,
    freeTransactionAllowance.verified,
    freeTransactionAllowance.voterIdTokenId,
    nativeBalance,
    nativeBalanceLoading,
    supportsSponsoredCalls,
  ]);
}
