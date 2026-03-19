"use client";

import { useMemo } from "react";
import { useActiveAccount, useActiveWallet, useCapabilities } from "thirdweb/react";
import { useAccount } from "wagmi";
import { isThirdwebWalletChain } from "~~/services/thirdweb/client";

export type WalletExecutionMode = "sponsored_7702" | "external_send_calls" | "fee_currency" | "direct_celo";

export function useWalletExecutionCapabilities() {
  const wallet = useActiveWallet();
  const thirdwebAccount = useActiveAccount();
  const { chainId } = useAccount();
  const supportedChain = isThirdwebWalletChain(chainId);
  const { data: capabilities } = useCapabilities({
    chainId,
    queryOptions: {
      enabled: Boolean(wallet) && supportedChain,
      retry: 0,
    },
  });

  return useMemo(() => {
    const activeCapabilities =
      typeof chainId === "number" && capabilities && chainId in capabilities ? capabilities[chainId] : undefined;
    const hasSendCalls = Boolean(thirdwebAccount?.sendCalls);
    const isThirdwebInApp = wallet?.id === "inApp";

    let executionMode: WalletExecutionMode = "direct_celo";

    if (supportedChain && isThirdwebInApp) {
      executionMode = "sponsored_7702";
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
