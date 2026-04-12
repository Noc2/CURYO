"use client";

import { useMemo } from "react";
import { useActiveWalletChain } from "thirdweb/react";
import { useAccount, useBalance } from "wagmi";
import { useFreeTransactionAllowance } from "~~/hooks/useFreeTransactionAllowance";
import {
  type WalletExecutionMode,
  resolveWalletExecutionChainId,
  useWalletExecutionCapabilities,
} from "~~/hooks/useWalletExecutionCapabilities";
import { supportsThirdwebExecutionCapabilities } from "~~/services/thirdweb/client";

type GasBalanceStatusOptions = {
  includeExternalSendCalls?: boolean;
};

export function shouldExpectThirdwebGasMode(params: {
  chainId: number | undefined;
  connectorId: string | undefined;
  includeExternalSendCalls: boolean;
  isThirdwebInApp: boolean;
}) {
  return (
    params.includeExternalSendCalls &&
    (params.connectorId === "in-app-wallet" || params.isThirdwebInApp) &&
    typeof params.chainId === "number" &&
    supportsThirdwebExecutionCapabilities(params.chainId)
  );
}

export function shouldAwaitSelfFundedGasModeReconnect(params: {
  canUseFreeTransactions: boolean;
  chainId: number | undefined;
  connectorId: string | undefined;
  executionMode: WalletExecutionMode;
  freeTransactionAllowanceResolved: boolean;
  includeExternalSendCalls: boolean;
  isThirdwebInApp: boolean;
}) {
  return (
    shouldExpectThirdwebGasMode(params) &&
    params.freeTransactionAllowanceResolved &&
    !params.canUseFreeTransactions &&
    params.executionMode !== "self_funded_7702"
  );
}

export function useGasBalanceStatus(options: GasBalanceStatusOptions = {}) {
  const includeExternalSendCalls = options.includeExternalSendCalls ?? false;
  const { address, chain, connector } = useAccount();
  const activeWalletChain = useActiveWalletChain();
  const { executionMode, isThirdwebInApp } = useWalletExecutionCapabilities();
  const freeTransactionAllowance = useFreeTransactionAllowance();
  const { data: nativeBalance, isLoading: nativeBalanceLoading } = useBalance({
    address,
    query: {
      enabled: Boolean(address),
    },
  });
  const resolvedChainId = resolveWalletExecutionChainId(chain?.id, activeWalletChain?.id);

  return useMemo(() => {
    const nativeBalanceValue = nativeBalance?.value ?? 0n;
    const nativeTokenSymbol = chain?.nativeCurrency?.symbol ?? "CELO";
    const hasResolvedNativeBalance = Boolean(address) && !nativeBalanceLoading && nativeBalance !== undefined;
    const expectsThirdwebGasMode = shouldExpectThirdwebGasMode({
      chainId: resolvedChainId,
      connectorId: connector?.id,
      includeExternalSendCalls,
      isThirdwebInApp,
    });
    const hasExecutableSponsoredCalls = executionMode === "sponsored_7702";
    const supportsSponsoredCalls = hasExecutableSponsoredCalls || expectsThirdwebGasMode;
    const canSponsorTransactions = supportsSponsoredCalls && freeTransactionAllowance.canUseFreeTransactions;
    const isAwaitingFreeTransactionAllowance = supportsSponsoredCalls && !freeTransactionAllowance.isResolved;
    const isAwaitingSponsoredWalletReconnect =
      expectsThirdwebGasMode && freeTransactionAllowance.canUseFreeTransactions && !hasExecutableSponsoredCalls;
    const isAwaitingSelfFundedWalletReconnect = shouldAwaitSelfFundedGasModeReconnect({
      canUseFreeTransactions: freeTransactionAllowance.canUseFreeTransactions,
      chainId: resolvedChainId,
      connectorId: connector?.id,
      executionMode,
      freeTransactionAllowanceResolved: freeTransactionAllowance.isResolved,
      includeExternalSendCalls,
      isThirdwebInApp,
    });
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
    connector?.id,
    executionMode,
    freeTransactionAllowance.canUseFreeTransactions,
    freeTransactionAllowance.limit,
    freeTransactionAllowance.remaining,
    freeTransactionAllowance.isResolved,
    freeTransactionAllowance.verified,
    freeTransactionAllowance.voterIdTokenId,
    includeExternalSendCalls,
    isThirdwebInApp,
    nativeBalance,
    nativeBalanceLoading,
    resolvedChainId,
  ]);
}
