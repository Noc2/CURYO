"use client";

import { useCallback } from "react";
import type { Wallet } from "thirdweb/wallets";
import { useConnect } from "wagmi";
import { thirdwebClient, thirdwebDefaultChain } from "~~/services/thirdweb/client";

export function useThirdwebWagmiSync() {
  const { connectAsync, connectors } = useConnect();

  const syncWalletToWagmi = useCallback(
    async (wallet: Wallet) => {
      if (!thirdwebClient) {
        return;
      }

      const connector = connectors.find(item => item.id === "in-app-wallet");
      if (!connector) {
        throw new Error("Thirdweb wagmi connector is not configured");
      }

      await connectAsync({
        chainId: wallet.getChain()?.id ?? thirdwebDefaultChain.id,
        connector,
        wallet,
      } as any);
    },
    [connectAsync, connectors],
  );

  return {
    syncWalletToWagmi,
  };
}
