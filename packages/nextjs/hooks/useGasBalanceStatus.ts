"use client";

import { useMemo } from "react";
import { useAccount, useBalance } from "wagmi";
import { useFreeTransactionAllowance } from "~~/hooks/useFreeTransactionAllowance";
import { useWalletExecutionCapabilities } from "~~/hooks/useWalletExecutionCapabilities";
import { supportsThirdwebExecutionCapabilities } from "~~/services/thirdweb/client";

type GasBalanceStatusOptions = {
  includeExternalSendCalls?: boolean;
};

export function useGasBalanceStatus(options: GasBalanceStatusOptions = {}) {
  const includeExternalSendCalls = options.includeExternalSendCalls ?? false;
  const { address, chain, connector } = useAccount();
  const { executionMode } = useWalletExecutionCapabilities();
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
    const expectsSponsoredCalls =
      includeExternalSendCalls &&
      connector?.id === "in-app-wallet" &&
      typeof chain?.id === "number" &&
      supportsThirdwebExecutionCapabilities(chain.id);
    const hasExecutableSponsoredCalls = executionMode === "sponsored_7702";
    const hasSelfFundedThirdwebCalls = executionMode === "self_funded_7702";
    const supportsSponsoredCalls = hasExecutableSponsoredCalls || expectsSponsoredCalls;
    const canSponsorTransactions = supportsSponsoredCalls && freeTransactionAllowance.canUseFreeTransactions;
    const isAwaitingFreeTransactionAllowance = supportsSponsoredCalls && !freeTransactionAllowance.isResolved;
    const isAwaitingSponsoredWalletReconnect =
      expectsSponsoredCalls && freeTransactionAllowance.canUseFreeTransactions && !hasExecutableSponsoredCalls;
    const isAwaitingSelfFundedWalletReconnect =
      expectsSponsoredCalls &&
      freeTransactionAllowance.isResolved &&
      !freeTransactionAllowance.canUseFreeTransactions &&
      !hasSelfFundedThirdwebCalls;
    const isMissingGasBalance =
      hasResolvedNativeBalance &&
      nativeBalanceValue === 0n &&
      !canSponsorTransactions &&
      !isAwaitingFreeTransactionAllowance &&
      !isAwaitingSponsoredWalletReconnect &&
      !isAwaitingSelfFundedWalletReconnect;

    return {
      canSponsorTransactions,
      executionMode,
      freeTransactionLimit: freeTransactionAllowance.limit,
      freeTransactionRemaining: freeTransactionAllowance.remaining,
      freeTransactionVerified: freeTransactionAllowance.verified,
      hasResolvedNativeBalance,
      isAwaitingFreeTransactionAllowance,
      isAwaitingSelfFundedWalletReconnect,
      isAwaitingSponsoredWalletReconnect,
      isMissingGasBalance,
      nativeBalanceValue,
      nativeTokenSymbol,
      supportsSponsoredCalls,
      voterIdTokenId: freeTransactionAllowance.voterIdTokenId,
    };
  }, [
    address,
    chain?.nativeCurrency?.symbol,
    chain?.id,
    connector?.id,
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
  ]);
}
