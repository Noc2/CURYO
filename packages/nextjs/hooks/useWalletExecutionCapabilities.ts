"use client";

import { useMemo } from "react";
import { useActiveAccount, useActiveWallet, useActiveWalletChain, useCapabilities } from "thirdweb/react";
import { useAccount } from "wagmi";
import { getThirdwebWalletSponsorshipMode, supportsThirdwebExecutionCapabilities } from "~~/services/thirdweb/client";

export type WalletExecutionMode =
  | "sponsored_7702"
  | "self_funded_7702"
  | "external_send_calls"
  | "fee_currency"
  | "direct_celo";

export function resolveWalletExecutionChainId(
  wagmiChainId: number | null | undefined,
  thirdwebChainId: number | null | undefined,
) {
  if (typeof wagmiChainId === "number") {
    return wagmiChainId;
  }

  if (typeof thirdwebChainId === "number") {
    return thirdwebChainId;
  }

  return undefined;
}

export function useWalletExecutionCapabilities() {
  const wallet = useActiveWallet();
  const thirdwebAccount = useActiveAccount();
  const activeWalletChain = useActiveWalletChain();
  const { chainId: wagmiChainId } = useAccount();
  const chainId = resolveWalletExecutionChainId(wagmiChainId, activeWalletChain?.id);
  const supportedChain = supportsThirdwebExecutionCapabilities(chainId);
  const { data: capabilities } = useCapabilities({
    chainId,
    queryOptions: {
      enabled: Boolean(wallet) && typeof chainId === "number" && supportedChain,
      retry: 0,
    },
  });

  return useMemo(() => {
    const activeCapabilities =
      typeof chainId === "number" && capabilities && chainId in capabilities ? capabilities[chainId] : undefined;
    const hasSendCalls = Boolean(thirdwebAccount?.sendCalls);
    const isThirdwebInApp = wallet?.id === "inApp";
    const thirdwebSponsorshipMode = isThirdwebInApp ? getThirdwebWalletSponsorshipMode(wallet) : null;

    let executionMode: WalletExecutionMode = "direct_celo";

    if (supportedChain && isThirdwebInApp && thirdwebSponsorshipMode === "sponsored") {
      executionMode = "sponsored_7702";
    } else if (supportedChain && isThirdwebInApp && thirdwebSponsorshipMode === "self-funded") {
      executionMode = "self_funded_7702";
    } else if (supportedChain && hasSendCalls && wallet) {
      executionMode = "external_send_calls";
    } else if (supportedChain) {
      executionMode = "fee_currency";
    }

    return {
      capabilities: activeCapabilities,
      executionMode,
      hasSendCalls,
      isThirdwebInApp,
      supportsFeeCurrencyFallback: supportedChain,
      supportsSponsoredCalls: executionMode === "sponsored_7702" || executionMode === "external_send_calls",
    };
  }, [capabilities, chainId, supportedChain, thirdwebAccount?.sendCalls, wallet]);
}
