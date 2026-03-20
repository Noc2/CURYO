"use client";

import { useMemo } from "react";
import { useActiveAccount, useActiveWallet, useCapabilities } from "thirdweb/react";
import { useAccount } from "wagmi";
import { getThirdwebWalletExecutionMode, supportsThirdwebExecutionCapabilities } from "~~/services/thirdweb/client";

export type WalletExecutionMode = "sponsored_7702" | "external_send_calls" | "fee_currency" | "direct_celo";

export function useWalletExecutionCapabilities() {
  const wallet = useActiveWallet();
  const thirdwebAccount = useActiveAccount();
  const { chainId } = useAccount();
  const supportedChain = supportsThirdwebExecutionCapabilities(chainId);
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
    const thirdwebExecutionMode =
      typeof chainId === "number" && isThirdwebInApp ? getThirdwebWalletExecutionMode(chainId).mode : null;

    let executionMode: WalletExecutionMode = "direct_celo";

    if (supportedChain && isThirdwebInApp && thirdwebExecutionMode === "EIP7702") {
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
