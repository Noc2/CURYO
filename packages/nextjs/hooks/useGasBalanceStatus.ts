"use client";

import { useMemo } from "react";
import { useAccount, useBalance } from "wagmi";
import { useWalletExecutionCapabilities } from "~~/hooks/useWalletExecutionCapabilities";

export function useGasBalanceStatus() {
  const { address, chain } = useAccount();
  const { supportsSponsoredCalls } = useWalletExecutionCapabilities();
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
    const isMissingGasBalance = hasResolvedNativeBalance && nativeBalanceValue === 0n && !supportsSponsoredCalls;

    return {
      hasResolvedNativeBalance,
      isMissingGasBalance,
      nativeBalanceValue,
      nativeTokenSymbol,
      supportsSponsoredCalls,
    };
  }, [address, chain?.nativeCurrency?.symbol, nativeBalance, nativeBalanceLoading, supportsSponsoredCalls]);
}
