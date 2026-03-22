"use client";

import { useMemo } from "react";
import { useAccount, useBalance } from "wagmi";
import { useFreeTransactionAllowance } from "~~/hooks/useFreeTransactionAllowance";
import { useWalletExecutionCapabilities } from "~~/hooks/useWalletExecutionCapabilities";

type GasBalanceStatusOptions = {
  includeExternalSendCalls?: boolean;
};

export function useGasBalanceStatus(options: GasBalanceStatusOptions = {}) {
  const includeExternalSendCalls = options.includeExternalSendCalls ?? false;
  const { address, chain } = useAccount();
  const { executionMode, supportsPaymasterService } = useWalletExecutionCapabilities();
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
    const supportsSponsoredCalls =
      executionMode === "sponsored_7702" ||
      (includeExternalSendCalls && executionMode === "external_send_calls" && supportsPaymasterService);
    const canSponsorTransactions = supportsSponsoredCalls && freeTransactionAllowance.canUseFreeTransactions;
    const isAwaitingFreeTransactionAllowance = supportsSponsoredCalls && !freeTransactionAllowance.isResolved;
    const isMissingGasBalance =
      hasResolvedNativeBalance &&
      nativeBalanceValue === 0n &&
      !canSponsorTransactions &&
      !isAwaitingFreeTransactionAllowance;

    return {
      canSponsorTransactions,
      executionMode,
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
    executionMode,
    freeTransactionAllowance.canUseFreeTransactions,
    freeTransactionAllowance.limit,
    freeTransactionAllowance.remaining,
    freeTransactionAllowance.isResolved,
    freeTransactionAllowance.verified,
    freeTransactionAllowance.voterIdTokenId,
    includeExternalSendCalls,
    nativeBalance,
    nativeBalanceLoading,
    supportsPaymasterService,
  ]);
}
