"use client";

import { useCallback } from "react";
import type { Wallet } from "thirdweb/wallets";
import { useConnect } from "wagmi";
import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";
import { thirdwebClient } from "~~/services/thirdweb/client";

export function useThirdwebWagmiSync() {
  const { connectAsync, connectors } = useConnect();
  const { targetNetwork } = useTargetNetwork();

  const syncWalletToWagmi = useCallback(
    async (wallet: Wallet, fallbackChainId: number = targetNetwork.id) => {
      if (!thirdwebClient) {
        return;
      }

      const connector = connectors.find(item => item.id === "in-app-wallet");
      if (!connector) {
        throw new Error("Thirdweb wagmi connector is not configured");
      }

      await connectAsync({
        chainId: wallet.getChain()?.id ?? fallbackChainId,
        connector,
        wallet,
      } as any);
    },
    [connectAsync, connectors, targetNetwork.id],
  );

  return {
    syncWalletToWagmi,
  };
}
