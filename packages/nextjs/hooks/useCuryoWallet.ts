"use client";

import { useMemo } from "react";
import { useActiveAccount, useActiveWallet, useActiveWalletChain } from "thirdweb/react";
import { useAccount } from "wagmi";
import { useWalletExecutionCapabilities } from "~~/hooks/useWalletExecutionCapabilities";

export function useCuryoWallet() {
  const { address, chain, chainId, connector, isConnected } = useAccount();
  const activeWallet = useActiveWallet();
  const activeAccount = useActiveAccount();
  const activeWalletChain = useActiveWalletChain();
  const capabilities = useWalletExecutionCapabilities();

  return useMemo(
    () => ({
      activeWallet,
      activeWalletChain,
      address,
      chain,
      chainId,
      connector,
      executionMode: capabilities.executionMode,
      isConnected,
      isThirdwebInApp: capabilities.isThirdwebInApp,
      supportsFeeCurrencyFallback: capabilities.supportsFeeCurrencyFallback,
      supportsSponsoredCalls: capabilities.supportsSponsoredCalls,
      thirdwebAccount: activeAccount,
    }),
    [
      activeAccount,
      activeWallet,
      activeWalletChain,
      address,
      capabilities.executionMode,
      capabilities.isThirdwebInApp,
      capabilities.supportsFeeCurrencyFallback,
      capabilities.supportsSponsoredCalls,
      chain,
      chainId,
      connector,
      isConnected,
    ],
  );
}
